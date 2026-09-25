'use strict';
// Tests de bout en bout du serveur avec un faux agy
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const PORT = 18000 + Math.floor(Math.random() * 2000);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'asm-test-'));
const HOME = path.join(TMP, 'home'), DATA = path.join(TMP, 'data'), WORK = path.join(TMP, 'work');
for (const d of [HOME, DATA, WORK]) fs.mkdirSync(d, { recursive: true });
const ENV = {
  ...process.env,
  PORT: String(PORT), SM_PORT: String(PORT), ASM_PORT: String(PORT), CSM_PORT: String(PORT),
  SM_DATA: DATA, ASM_DATA: DATA, CSM_DATA: DATA, HOME, USERPROFILE: HOME,
  SM_AGY: process.execPath, SM_AGY_ARGS: `"${path.join(__dirname, 'fake-agy.js')}"`,
  ASM_AGY: process.execPath, ASM_AGY_ARGS: `"${path.join(__dirname, 'fake-agy.js')}"`,
  SM_CLAUDE: process.execPath, SM_CLAUDE_ARGS: `"${path.join(__dirname, 'fake-agy.js')}"`,
  CSM_CLAUDE: process.execPath, CSM_CLAUDE_ARGS: `"${path.join(__dirname, 'fake-agy.js')}"`,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};

let server = null, token = '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function req(method, p, body, { raw, headers = {}, host } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : raw ? body : Buffer.from(JSON.stringify(body));
    const r = http.request({
      host: '127.0.0.1', port: PORT, path: p, method,
      headers: { Host: host || `127.0.0.1:${PORT}`, 'X-ASM-Token': token, 'Content-Type': 'application/json', ...headers }
    }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { } resolve({ status: res.statusCode, body: j, text: b }); });
    });
    r.on('error', e => reject(new Error(`${method} ${p} : ${e.message}`)));
    if (data) r.write(data); r.end();
  });
}
const api = async (m, p, b, o) => { const r = await req(m, p, b, o); if (r.status >= 400) throw new Error(`${m} ${p} → ${r.status} ${r.text}`); return r.body; };

async function waitFor(fn, ms = 15000, what = 'condition') {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await sleep(150); }
  throw new Error(`délai dépassé : ${what} (${last instanceof Error ? last.message : JSON.stringify(last)})`);
}

function startServer() {
  server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: ENV, stdio: 'ignore' });
  return waitFor(async () => (await req('GET', '/')).status === 200, 15000, 'démarrage du serveur')
    .then(() => { token = fs.readFileSync(path.join(DATA, 'token'), 'utf8').trim(); });
}
async function stopServer() {
  if (!server) return;
  const p = server; server = null;
  p.kill('SIGTERM');
  await waitFor(async () => { try { await req('GET', '/'); return false; } catch { return true; } }, 10000, 'arrêt du serveur');
}

function wsClient() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`, { headers: { Host: `127.0.0.1:${PORT}` } });
  const out = {};
  ws.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'out' || m.t === 'replay') out[m.id] = (out[m.id] || '') + m.d; });
  return new Promise(r => ws.on('open', () => r({ ws, out, input: (id, d) => ws.send(JSON.stringify({ t: 'input', id, d })) })));
}
const session = async id => (await api('GET', '/api/sessions')).find(s => s.id === id);
const idle = id => waitFor(async () => { const s = await session(id); return s && s.status === 'idle' ? s : null; }, 15000, 'session prête');

before(startServer);
after(async () => {
  await stopServer();
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { }
});

test('sécurité : jeton et en-tête Host exigés', async () => {
  assert.equal((await req('GET', '/api/sessions', undefined, { headers: { 'X-ASM-Token': 'mauvais' } })).status, 401);
  assert.equal((await req('GET', '/', undefined, { host: 'evil.example:80' })).status, 403);
  const page = await req('GET', '/');
  assert.match(page.text, /name="asm-token"/);
  assert.equal((await api('GET', '/api/version')).version, require('../package.json').version);
});

let S;
test('session : démarrage, hooks, échange, état', async () => {
  S = await api('POST', '/api/sessions', { cwd: WORK, name: 'test' });
  const s = await idle(S.id);
  assert.ok(s.id, 'session démarrée');
  const c = await wsClient();
  c.input(S.id, 'bonjour\r');
  await waitFor(() => (c.out[S.id] || '').includes('echo: bonjour'), 10000, 'réponse');
  await waitFor(async () => (await session(S.id)).message === 'terminé', 10000, 'état « terminé »');
  c.ws.close();
});

test('renommage : mémorisé et visible dans l’historique', async () => {
  await api('POST', `/api/sessions/${S.id}/rename`, { name: 'Projet Test' });
  const s = await session(S.id);
  assert.equal(s.name, 'Projet Test');
});

test('fichiers : upload d’image', async () => {
  const r = await req('POST', '/api/upload', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { raw: true, headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent('capture.png') } });
  assert.equal(r.status, 200);
  assert.ok(fs.existsSync(r.body.path));
});

test('file d’attente : prompts envoyés séquentiellement', async () => {
  const c = await wsClient();
  await api('PUT', `/api/sessions/${S.id}/queue`, [{ text: 'premier' }, { text: 'second' }]);
  await waitFor(() => (c.out[S.id] || '').includes('echo: second'), 15000, 'deux prompts traités');
  assert.ok(c.out[S.id].indexOf('echo: premier') < c.out[S.id].indexOf('echo: second'));
  assert.equal((await session(S.id)).queue, undefined);
  c.ws.close();
});

test('harmonisation des modèles et de l’effort sans conflit', async () => {
  const s1 = await api('POST', '/api/sessions', {
    cwd: WORK,
    name: 'conflict-test',
    args: '--model gemini-3.8-flash-high --effort medium'
  });
  const ses1 = await idle(s1.id);
  assert.ok(ses1.id, 'session démarrée sans crash');

  const s2 = await api('POST', '/api/sessions', {
    cwd: WORK,
    name: 'claude-test',
    model: 'claude-sonnet-4-6',
    effort: 'medium'
  });
  const ses2 = await idle(s2.id);
  assert.ok(ses2.id, 'session claude démarrée sans crash');
});

test('dual-agent : exécution simultanée Claude Code & Antigravity', async () => {
  const claudeSess = await api('POST', '/api/sessions', {
    cwd: WORK,
    name: 'claude-sess',
    agent: 'claude',
    model: 'claude-3-7-sonnet',
    effort: 'high'
  });
  const agySess = await api('POST', '/api/sessions', {
    cwd: WORK,
    name: 'agy-sess',
    agent: 'agy',
    model: 'gemini-3.8-flash',
    effort: 'medium'
  });

  assert.equal(claudeSess.agent, 'claude');
  assert.equal(agySess.agent, 'agy');

  const cWait = await idle(claudeSess.id);
  const aWait = await idle(agySess.id);

  assert.ok(cWait.id);
  assert.ok(aWait.id);

  const status = await api('GET', '/api/agents/status');
  assert.ok(status.claude);
  assert.ok(status.agy);
});
