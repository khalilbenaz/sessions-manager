'use strict';
// Sessions Manager — serveur local : héberge N sessions Claude Code & Antigravity CLI (PTY) et les expose à une UI web.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');
const {
  ROOT, PORT, IS_WIN, IS_MAC, DATA, LEGACY_DATA,
  which, resolveClaude, resolveAgy, hasClaude, hasAgy, stablePath,
  CLAUDE_DIR, CLAUDE_HISTORY_FILE, CLAUDE_PROJECTS_DIR,
  BRAIN_DIR, AGY_HISTORY_FILE, GEMINI_CONFIG_DIR
} = require('./lib/config');
const handoff = require('./lib/handoff');

const HOST = '127.0.0.1';
const VERSION = require('./package.json').version;
const UPLOADS = path.join(os.tmpdir(), 'sm-uploads');
const UPLOAD_MAX = 30 * 1024 * 1024;
const SCROLLBACK_MAX = 2 * 1024 * 1024;

fs.mkdirSync(DATA, { recursive: true });

// Journal fichier
const LOG = path.join(DATA, 'server.log');
for (const k of ['log', 'error']) {
  const orig = console[k];
  console[k] = (...a) => {
    try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${a.map(x => x instanceof Error ? x.stack : String(x)).join(' ')}\n`); } catch { }
    orig.apply(console, a);
  };
}
process.on('uncaughtException', e => console.error('uncaught', e));
process.on('unhandledRejection', e => console.error('unhandled', e));

// Jeton anti-CSRF
const TOKEN_FILE = path.join(DATA, 'token');
const TOKEN = fs.existsSync(TOKEN_FILE)
  ? fs.readFileSync(TOKEN_FILE, 'utf8').trim()
  : (() => { const t = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(TOKEN_FILE, t); return t; })();

const CLAUDE = resolveClaude();
const AGY = resolveAgy();

// Hooks Claude Code injectés via --settings
const fwd = p => p.replace(/\\/g, '/');
const HOOK_SCRIPT = fwd(path.join(ROOT, 'hook.js'));
function hookRunner() {
  if (!process.versions.electron) return `"${fwd(process.execPath)}" "${HOOK_SCRIPT}"`;
  const sysNode = stablePath(which(IS_WIN ? 'node.exe' : 'node'));
  if (sysNode) return `"${fwd(sysNode)}" "${HOOK_SCRIPT}"`;
  const file = path.join(DATA, IS_WIN ? 'hook.cmd' : 'hook.sh');
  const body = IS_WIN
    ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${path.join(ROOT, 'hook.js')}" %*\r\n`
    : `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${path.join(ROOT, 'hook.js')}" "$@"\n`;
  fs.writeFileSync(file, body);
  if (!IS_WIN) fs.chmodSync(file, 0o755);
  return `"${fwd(file)}"`;
}
const HOOK_RUNNER = hookRunner();
const hookCmd = (ev) => [{ hooks: [{ type: 'command', command: `${HOOK_RUNNER} ${ev}`, timeout: 15 }] }];
const HOOK_SETTINGS = path.join(DATA, 'hooks-settings.json');
fs.writeFileSync(HOOK_SETTINGS, JSON.stringify({
  hooks: {
    SessionStart: hookCmd('start'),
    UserPromptSubmit: hookCmd('working'),
    PreToolUse: hookCmd('working'),
    Notification: hookCmd('attention'),
    Stop: hookCmd('idle'),
    SessionEnd: hookCmd('end'),
  },
}, null, 2));

// Hooks Antigravity CLI enregistrés dans ~/.gemini/config/hooks.json
function registerAgyHooks() {
  try {
    fs.mkdirSync(GEMINI_CONFIG_DIR, { recursive: true });
    const hookConfigPath = path.join(GEMINI_CONFIG_DIR, 'hooks.json');
    let current = {};
    try { current = JSON.parse(fs.readFileSync(hookConfigPath, 'utf8')); } catch { }
    const hookScript = path.join(ROOT, 'hook.js');
    current['sessions-manager'] = {
      enabled: true,
      PreInvocation: [
        { type: 'command', command: `node "${hookScript}" PreInvocation`, timeout: 5 }
      ],
      PreToolUse: [
        {
          matcher: '.*',
          hooks: [
            { type: 'command', command: `node "${hookScript}" PreToolUse`, timeout: 5 }
          ]
        }
      ],
      Stop: [
        { type: 'command', command: `node "${hookScript}" Stop`, timeout: 5 }
      ]
    };
    fs.writeFileSync(hookConfigPath, JSON.stringify(current, null, 2));
  } catch (e) {
    console.error('Erreur enregistrement hooks agy :', e.message);
  }
}
registerAgyHooks();

// ---------------------------------------------------------------- sessions gérées
const STORE = path.join(DATA, 'sessions.json');
const TITLES_FILE = path.join(DATA, 'titles.json');
/** @type {Map<string, any>} */
const sessions = new Map();

function loadCustomTitles() {
  try { return JSON.parse(fs.readFileSync(TITLES_FILE, 'utf8')); } catch { return {}; }
}
function writeCustomTitle(id, title) {
  let ok = false;
  // Format Claude
  const f = transcriptPath(id);
  if (f && title) {
    try {
      fs.appendFileSync(f, JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: id }) + '\n');
      ok = true;
    } catch { }
  }
  // Format AGY
  try {
    const t = loadCustomTitles();
    t[id] = title;
    fs.writeFileSync(TITLES_FILE, JSON.stringify(t, null, 2));
    ok = true;
  } catch { }
  return ok;
}

const EXTRA_FIELDS = ['agent', 'group', 'pinned', 'color', 'worktree', 'queue', 'alerts', 'model', 'mode', 'effort', 'agentIds', 'agentCfg', 'switches'];
const extra = s => Object.fromEntries(EXTRA_FIELDS.filter(k => s[k] !== undefined).map(k => [k, s[k]]));

function persist() {
  const list = [...sessions.values()].map(s => ({
    id: s.id, agent: s.agent || 'claude', name: s.name, cwd: s.cwd, args: s.args,
    conversationId: s.conversationId, claudeSessionId: s.claudeSessionId,
    createdAt: s.createdAt, order: s.order, wantRun: s.wantRun !== false, named: !!s.named, titleFor: s.titleFor || null,
    ...extra(s), ...(s.lock ? { lock: s.lock } : {}),
  }));
  fs.writeFileSync(STORE, JSON.stringify(list, null, 2));
}

function publicView(s) {
  return {
    id: s.id, agent: s.agent || 'claude', name: s.name, cwd: s.cwd, args: s.args, status: s.status, message: s.message,
    conversationId: s.conversationId, claudeSessionId: s.claudeSessionId,
    createdAt: s.createdAt, lastActivity: s.lastActivity,
    statusSince: s.statusSince, alive: !!s.pty, order: s.order, ...extra(s),
    ...(s.lock ? { locked: true, lockHint: s.lock.hint || '', message: '', queue: s.queue ? s.queue.map(q => ({ id: q.id, text: '' })) : undefined } : {}),
  };
}

function setStatus(s, status, message) {
  if (s.status === status && s.message === message) return;
  s.status = status;
  s.message = message || '';
  s.statusSince = Date.now();
  broadcast({ t: 'session', s: publicView(s) });
}

function splitArgs(str) {
  const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m;
  while ((m = re.exec(str || ''))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function transcriptPath(id) {
  if (!/^[\w-]+$/.test(id || '')) return null;
  // Antigravity brain
  const brainFile = path.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
  if (fs.existsSync(brainFile)) return brainFile;
  // Claude Code projects
  try {
    if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
      for (const d of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
        const f = path.join(CLAUDE_PROJECTS_DIR, d, `${id}.jsonl`);
        if (fs.existsSync(f)) return f;
      }
    }
  } catch { }
  return null;
}
const transcriptExists = id => !!transcriptPath(id);

function lastTurnInterrupted(id) {
  const f = transcriptPath(id);
  if (!f) return false;
  try {
    const size = fs.statSync(f).size, len = Math.min(size, 64 * 1024), buf = Buffer.alloc(len);
    const fd = fs.openSync(f, 'r');
    try { fs.readSync(fd, buf, 0, len, Math.max(0, size - len)); } finally { fs.closeSync(fd); }
    return buf.toString('utf8').includes('Request interrupted by user');
  } catch { return false; }
}

function checkInterruptedSoon(s, ms = 250) {
  setTimeout(() => {
    const id = s.claudeSessionId || s.conversationId || s.id;
    if ((s.status === 'working' || s.status === 'attention') && lastTurnInterrupted(id)) setStatus(s, 'idle', 'interrompu');
  }, ms);
}

function renameSession(s, name) {
  s.name = String(name || s.name).trim().slice(0, 80) || s.name;
  s.named = true;
  const cId = s.conversationId || s.claudeSessionId;
  s.titleFor = cId && writeCustomTitle(cId, s.name) ? cId : null;
  persist();
  broadcast({ t: 'session', s: publicView(s) });
}

function spawnSession(s, { resume, fork } = {}) {
  const isAgy = s.agent === 'agy';
  const binary = isAgy ? AGY : CLAUDE;

  let explicitModel = s.model || '';
  let explicitEffort = s.effort || '';
  let explicitMode = s.mode || '';
  const extraArgs = [];
  // Premier prompt (briefing de bascule d'agent ou prompt de création) : injecté une seule fois,
  // pour ne pas le rejouer lors des redémarrages ultérieurs de la session.
  const firstPrompt = s.initialPrompt || '';

  const splitUserArgs = splitArgs(s.args || '');
  for (let i = 0; i < splitUserArgs.length; i++) {
    const a = splitUserArgs[i];
    if (a === '--model' && i + 1 < splitUserArgs.length) explicitModel = splitUserArgs[++i];
    else if (a.startsWith('--model=')) explicitModel = a.slice(8);
    else if (a === '--effort' && i + 1 < splitUserArgs.length) explicitEffort = splitUserArgs[++i];
    else if (a.startsWith('--effort=')) explicitEffort = a.slice(9);
    else if (a === '--mode' && i + 1 < splitUserArgs.length) explicitMode = splitUserArgs[++i];
    else if (a.startsWith('--mode=')) explicitMode = a.slice(7);
    else if (a === '--dangerously-skip-permissions') explicitMode = 'dangerously-skip-permissions';
    else extraArgs.push(a);
  }

  const args = [];

  if (isAgy) {
    const rawArgs = splitArgs(process.env.SM_AGY_ARGS || process.env.ASM_AGY_ARGS || '');
    args.push(...rawArgs);
    if (resume) args.push('--conversation', resume);
    // `--prompt-interactive` : injecte le briefing de transfert puis laisse la session ouverte.
    if (firstPrompt) args.push('--prompt-interactive', firstPrompt);

    let m = String(explicitModel || '').trim();
    let eff = String(explicitEffort || '').trim();
    const mMatch = m.match(/^(gemini-\d+\.\d+-(?:flash|pro))-(high|medium|low)$/);
    if (mMatch) { m = mMatch[1]; if (!eff) eff = mMatch[2]; }

    if (m.startsWith('claude-')) {
      args.push('--model', m);
    } else if (m.startsWith('gpt-oss')) {
      args.push('--model', 'gpt-oss-120b-medium');
    } else if (m === 'gemini-3.1-pro') {
      args.push('--model', m);
      if (eff !== 'low' && eff !== 'high') eff = 'high';
      args.push('--effort', eff);
    } else if (m.startsWith('gemini-')) {
      args.push('--model', m);
      if (!eff || (eff !== 'low' && eff !== 'medium' && eff !== 'high')) eff = 'medium';
      args.push('--effort', eff);
    } else if (m) {
      args.push('--model', m);
      if (eff && ['low', 'medium', 'high'].includes(eff)) args.push('--effort', eff);
    } else if (eff) {
      if (['low', 'medium', 'high'].includes(eff)) args.push('--effort', eff);
    }

    if (explicitMode === 'accept-edits' || explicitMode === 'plan') {
      args.push('--mode', explicitMode);
    } else if (explicitMode === 'dangerously-skip-permissions') {
      args.push('--dangerously-skip-permissions');
    } else if (explicitMode) {
      args.push('--mode', explicitMode);
    }
  } else {
    // Claude Code
    const rawArgs = splitArgs(process.env.SM_CLAUDE_ARGS || process.env.CSM_CLAUDE_ARGS || '');
    args.push(...rawArgs, '--settings', HOOK_SETTINGS);
    if (resume) args.push('--resume', resume);
    if (resume && fork) args.push('--fork-session');
    if (explicitModel) args.push('--model', explicitModel);
    if (explicitEffort) args.push('--effort', explicitEffort);
    if (explicitMode === 'dangerously-skip-permissions') args.push('--dangerously-skip-permissions');
    // Prompt positionnel : Claude démarre en interactif sur ce message (reprise comprise).
    if (firstPrompt) args.push(firstPrompt);
  }

  args.push(...extraArgs);

  const env = {
    ...process.env,
    SM_ID: s.id,
    SM_PORT: String(PORT),
    SM_TOKEN: TOKEN,
    ASM_ID: s.id,
    ASM_PORT: String(PORT),
    ASM_TOKEN: TOKEN,
    CSM_ID: s.id,
    CSM_PORT: String(PORT),
    CSM_TOKEN: TOKEN,
    COLORTERM: 'truecolor',
  };

  // Évite les propagations indésirables d'agents parents
  for (const k of Object.keys(env)) {
    if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID$|CLAUDE_EFFORT$|AI_AGENT$|ANTIGRAVITY_AGENT|ELECTRON_RUN_AS_NODE$)/i.test(k)) delete env[k];
  }

  let p;
  try {
    p = pty.spawn(binary, args, {
      name: 'xterm-256color', cols: s.cols || 120, rows: s.rows || 32,
      cwd: fs.existsSync(s.cwd) ? s.cwd : os.homedir(), env,
    });
  } catch (e) {
    s.pty = null;
    appendOut(s, `\r\n\x1b[31m[sm] Échec du lancement de ${isAgy ? 'Antigravity' : 'Claude'} : ${e.message}\x1b[0m\r\n`);
    setStatus(s, 'exited', 'échec du lancement');
    return;
  }

  s.pty = p;
  if (firstPrompt) s.initialPrompt = '';
  if (s.wantRun !== true) { s.wantRun = true; persist(); }
  setStatus(s, 'starting');

  p.onData(d => {
    s.lastActivity = Date.now();
    appendOut(s, d);
    if (s.status === 'starting') setStatus(s, 'idle');
  });

  p.onExit(({ exitCode }) => {
    if (s.pty !== p || !sessions.has(s.id)) return;
    s.pty = null;
    setTimeout(() => {
      if (!shuttingDown && !s.pty && sessions.has(s.id)) { s.wantRun = false; persist(); }
    }, 8000);
    appendOut(s, `\r\n\x1b[90m[sm] session terminée (code ${exitCode})\x1b[0m\r\n`);
    setStatus(s, 'exited', `code ${exitCode}`);
  });
}

function appendOut(s, d) {
  s.buf += d;
  if (s.buf.length > SCROLLBACK_MAX) {
    let cut = s.buf.length - SCROLLBACK_MAX;
    const nl = s.buf.indexOf('\n', cut);
    s.buf = s.buf.slice(nl > 0 ? nl + 1 : cut);
  }
  const data = JSON.stringify({ t: 'out', id: s.id, d });
  for (const c of clients) if (c.readyState === 1 && (!s.lock || ctx.wsCan?.(s, c))) c.send(data);
}

function createSession({ name, cwd, args, resume, model, mode, effort, agent, ...more }) {
  cwd = cwd ? path.resolve(cwd.replace(/^~(?=$|[\\/])/, os.homedir())) : os.homedir();
  const id = crypto.randomBytes(6).toString('hex');
  const order = Math.max(0, ...[...sessions.values()].map(x => x.order || 0)) + 1;
  const chosenAgent = agent === 'agy' ? 'agy' : (agent === 'claude' ? 'claude' : (ctx.getSettings?.().defaultAgent || 'claude'));

  const s = {
    id, agent: chosenAgent, name: name || path.basename(cwd || '') || 'session', cwd: cwd || os.homedir(),
    args: args || '', model: model || '', mode: mode || '', effort: effort || '',
    conversationId: chosenAgent === 'agy' ? (resume || null) : null,
    claudeSessionId: chosenAgent === 'claude' ? (resume || null) : null,
    createdAt: Date.now(), lastActivity: Date.now(),
    status: 'starting', message: '', statusSince: Date.now(), buf: '', pty: null, order,
    ...Object.fromEntries(EXTRA_FIELDS.filter(k => more[k] !== undefined).map(k => [k, more[k]])),
  };
  if (more.initialPrompt) s.initialPrompt = String(more.initialPrompt).slice(0, 20000);
  sessions.set(id, s);
  spawnSession(s, { resume });
  persist();
  broadcast({ t: 'session', s: publicView(s) });
  return s;
}

function killSession(s) {
  if (s.pty) { try { s.pty.kill(); } catch { } }
}

// ------------------------------------------------- bascule d'agent dans une même session
// `claude` et `agy` n'échangent pas leurs conversations : le contexte est reconstruit
// depuis le transcript (briefing Markdown) puis injecté comme premier prompt de l'agent
// cible. Si cette session a déjà utilisé l'agent cible, on reprend sa conversation :
// les deux historiques s'accumulent alors au fil des allers-retours.
function agentDefaults(agent) {
  const st = ctx.getSettings?.() || {};
  return {
    model: agent === 'claude' ? '' : (st.defaultModel || ''),
    effort: agent === 'claude' ? '' : (st.defaultEffort || ''),
    mode: st.defaultMode || '',
  };
}

/** Un modèle Gemini / gpt-oss n'a pas de sens pour `claude`. */
function fitModel(agent, model) {
  const m = String(model || '').trim();
  if (agent !== 'claude') return m;
  if (/^(gemini|gpt-oss)/.test(m)) return '';
  return m;
}

function switchAgent(s, to) {
  const from = s.agent === 'agy' ? 'agy' : 'claude';
  const srcId = s.conversationId || s.claudeSessionId || null;
  if (srcId) s.agentIds = { ...(s.agentIds || {}), [from]: srcId };
  s.agentCfg = { ...(s.agentCfg || {}), [from]: { model: s.model || '', effort: s.effort || '', mode: s.mode || '' } };

  // --- Briefing de contexte
  const file = handoff.transcriptFile(from, srcId);
  let brief = null, briefPath = null, stats = null;
  if (file) {
    const built = handoff.buildBriefing({ file, from, to, sessionName: s.name, cwd: s.cwd });
    if (built) {
      try {
        const dir = path.join(DATA, 'handoffs');
        fs.mkdirSync(dir, { recursive: true });
        briefPath = path.join(dir, `${s.id}-${Date.now()}.md`);
        fs.writeFileSync(briefPath, built.markdown);
        brief = built.markdown;
        stats = built.stats;
      } catch { }
    }
  }

  // --- Configuration propre à l'agent cible
  const targetId = (s.agentIds || {})[to] || null;
  const cfg = s.agentCfg?.[to] || agentDefaults(to);
  s.agent = to;
  s.model = fitModel(to, cfg.model);
  s.effort = to === 'claude' ? '' : (cfg.effort || '');
  s.mode = to === 'claude' ? (cfg.mode === 'dangerously-skip-permissions' ? cfg.mode : '') : (cfg.mode || '');
  s.conversationId = to === 'agy' ? targetId : null;
  s.claudeSessionId = to === 'claude' ? targetId : null;
  s.initialPrompt = brief || '';

  killSession(s);
  s.buf = '';
  broadcast({ t: 'clear', id: s.id });
  s.buf += `\x1b[90m[sm] Bascule ${handoff.AGENT_LABEL[from]} → ${handoff.AGENT_LABEL[to]}`
    + `${targetId ? ' (reprise de la conversation)' : ''}`
    + `${brief ? ` · contexte transmis (${stats.chars} car., ${stats.turns} tours)` : ' · aucun historique à transmettre'}`
    + `${briefPath ? ` · ${briefPath}` : ''}\x1b[0m\r\n`;
  spawnSession(s, { resume: targetId || undefined });
  s.switches = [...(s.switches || []), { from, to, at: Date.now(), chars: stats ? stats.chars : 0, turns: stats ? stats.turns : 0, resumed: !!targetId }].slice(-20);
  persist();
  broadcast({ t: 'session', s: publicView(s) });
  return { session: s, brief: briefPath, stats };
}

let shuttingDown = false;
const toRestore = [];
try {
  for (const x of JSON.parse(fs.readFileSync(STORE, 'utf8'))) {
    const s = {
      agent: x.agent || 'claude', ...x,
      status: 'exited', message: 'arrêtée', statusSince: Date.now(), lastActivity: x.createdAt, buf: '', pty: null
    };
    sessions.set(x.id, s);
    if (x.wantRun !== false) toRestore.push(s);
    else s.buf = `\x1b[90m[sm] Session arrêtée. Cliquer « Reprendre » pour la relancer.\x1b[0m\r\n`;
  }
} catch { }

function restoreSessions() {
  toRestore.forEach((s, i) => setTimeout(() => {
    if (!sessions.has(s.id) || s.pty) return;
    s.buf = `\x1b[90m[sm] Session restaurée.\x1b[0m\r\n`;
    broadcast({ t: 'clear', id: s.id });
    spawnSession(s, { resume: s.conversationId || s.claudeSessionId || undefined });
  }, i * 1200));
}

// ---------------------------------------------------------------- historique (Claude & AGY)
const histCache = new Map();

function readSlice(fd, pos, len) {
  const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, pos); return b.slice(0, n).toString('utf8');
}

function parseAgyTranscript(file, stat, id) {
  const fd = fs.openSync(file, 'r');
  try {
    const HEAD = 96 * 1024, TAIL = 96 * 1024;
    const head = readSlice(fd, 0, Math.min(HEAD, stat.size));
    const tail = stat.size > HEAD ? readSlice(fd, Math.max(0, stat.size - TAIL), Math.min(TAIL, stat.size)) : '';
    let firstPrompt = null, lastPrompt = null;
    for (const line of (head + '\n' + tail).split('\n')) {
      if (!line.startsWith('{')) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.type === 'USER_INPUT' && o.content) {
        let text = o.content;
        const m = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        if (m) text = m[1].trim();
        if (!firstPrompt) firstPrompt = text;
        lastPrompt = text;
      }
    }
    return {
      id, cwd: '', branch: null, agent: 'agy',
      title: (firstPrompt || lastPrompt || '').slice(0, 120) || '(sans titre)',
      lastPrompt: (lastPrompt || firstPrompt || '').slice(0, 200),
      mtime: stat.mtimeMs, size: stat.size,
    };
  } finally { fs.closeSync(fd); }
}

function parseClaudeTranscript(file, stat) {
  const fd = fs.openSync(file, 'r');
  try {
    const HEAD = 64 * 1024, TAIL = 64 * 1024;
    const head = readSlice(fd, 0, Math.min(HEAD, stat.size));
    const tail = stat.size > HEAD ? readSlice(fd, Math.max(0, stat.size - TAIL), Math.min(TAIL, stat.size)) : '';
    let cwd = '', branch = null, title = null, customTitle = null, firstPrompt = null, lastPrompt = null;
    for (const line of (head + '\n' + tail).split('\n')) {
      if (!line.startsWith('{')) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      if (o.cwd && !cwd) cwd = o.cwd;
      if (o.gitBranch && !branch) branch = o.gitBranch;
      if (o.type === 'ai-title' && o.aiTitle) title = o.aiTitle;
      if (o.type === 'custom-title' && o.customTitle) customTitle = o.customTitle;
      if (o.type === 'summary' && o.summary && !title) title = o.summary;
      if (o.type === 'last-prompt' && o.lastPrompt) lastPrompt = o.lastPrompt;
      if (!firstPrompt && o.type === 'user' && o.message && !o.isMeta) {
        const c = o.message.content;
        const txt = typeof c === 'string' ? c : Array.isArray(c) ? (c.find(p => p.type === 'text') || {}).text : null;
        if (txt && !txt.startsWith('<') && !txt.startsWith('Caveat:')) firstPrompt = txt;
      }
    }
    if (!cwd && !firstPrompt && !title) return null;
    return {
      id: path.basename(file, '.jsonl'), cwd, branch, agent: 'claude',
      title: customTitle || title || (firstPrompt || lastPrompt || '').slice(0, 120) || '(sans titre)',
      lastPrompt: (lastPrompt || firstPrompt || '').slice(0, 200),
      mtime: stat.mtimeMs, size: stat.size,
    };
  } finally { fs.closeSync(fd); }
}

function history() {
  const out = [];
  const seen = new Set();
  const titles = loadCustomTitles();

  // 1. Antigravity history.jsonl
  if (fs.existsSync(AGY_HISTORY_FILE)) {
    try {
      const lines = fs.readFileSync(AGY_HISTORY_FILE, 'utf8').trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i];
        if (!l.startsWith('{')) continue;
        let o; try { o = JSON.parse(l); } catch { continue; }
        const id = o.conversationId;
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const title = titles[id] || o.display || '(sans titre)';
        out.push({
          id, cwd: o.workspace || '', branch: null, agent: 'agy',
          title: title.slice(0, 120),
          lastPrompt: (o.display || '').slice(0, 200),
          mtime: o.timestamp || Date.now(),
          size: 1024,
        });
      }
    } catch { }
  }

  // 2. Antigravity brain
  if (fs.existsSync(BRAIN_DIR)) {
    try {
      const dirs = fs.readdirSync(BRAIN_DIR);
      for (const id of dirs) {
        if (seen.has(id) || !/^[\w-]+$/.test(id)) continue;
        const transcriptFile = path.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
        let st; try { st = fs.statSync(transcriptFile); } catch { continue; }
        if (st.size < 50) continue;
        seen.add(id);
        const c = histCache.get(transcriptFile);
        if (c && c.mtime === st.mtimeMs) { if (c.entry) out.push(c.entry); continue; }
        let entry = null; try { entry = parseAgyTranscript(transcriptFile, st, id); } catch { }
        histCache.set(transcriptFile, { mtime: st.mtimeMs, entry });
        if (entry) {
          if (titles[id]) entry.title = titles[id];
          out.push(entry);
        }
      }
    } catch { }
  }

  // 3. Claude Code projects
  if (fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    try {
      for (const d of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
        if (/observer-sessions/i.test(d)) continue;
        const dir = path.join(CLAUDE_PROJECTS_DIR, d);
        let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { continue; }
        for (const f of files) {
          const file = path.join(dir, f);
          const id = path.basename(f, '.jsonl');
          if (seen.has(id)) continue;
          let st; try { st = fs.statSync(file); } catch { continue; }
          if (st.size < 200) continue;
          seen.add(id);
          const c = histCache.get(file);
          if (c && c.mtime === st.mtimeMs) { if (c.entry) out.push(c.entry); continue; }
          let entry = null; try { entry = parseClaudeTranscript(file, st); } catch { }
          histCache.set(file, { mtime: st.mtimeMs, entry });
          if (entry) out.push(entry);
        }
      }
    } catch { }
  }

  return out.sort((a, b) => b.mtime - a.mtime);
}

// ---------------------------------------------------------------- sélecteur de dossier
let picking = null;
function pickFolder(initial) {
  if (picking) return picking;
  const env = { ...process.env, SM_INITIAL: initial || '', ASM_INITIAL: initial || '' };
  let cmd, args;
  if (IS_WIN) {
    cmd = which('pwsh') || 'powershell.exe';
    args = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'pick-folder.ps1')];
  } else if (IS_MAC) {
    cmd = 'osascript';
    const init = initial ? ` default location (POSIX file "${initial.replace(/"/g, '\\"')}")` : '';
    args = ['-e', `try\nPOSIX path of (choose folder with prompt "Choisir un dossier de travail"${init})\non error\n""\nend try`];
  } else {
    cmd = 'zenity';
    args = ['--file-selection', '--directory', '--title=Choisir un dossier de travail'];
    if (initial) args.push(`--filename=${initial}/`);
  }
  return (picking = new Promise(resolve => {
    execFile(cmd, args, { encoding: 'utf8', env }, (err, stdout) => {
      picking = null;
      resolve((stdout || '').trim().replace(/[\r\n]+$/, '') || null);
    });
  }));
}

function externalSessions() {
  return [];
}

async function importExternal(pid, sessionId, mode) {
  throw new Error('Import non supporté');
}

// ---------------------------------------------------------------- HTTP
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const STATIC = {
  '/xterm.js': 'node_modules/@xterm/xterm/lib/xterm.js',
  '/xterm.css': 'node_modules/@xterm/xterm/css/xterm.css',
  '/addon-fit.js': 'node_modules/@xterm/addon-fit/lib/addon-fit.js',
  '/addon-web-links.js': 'node_modules/@xterm/addon-web-links/lib/addon-web-links.js',
  '/addon-webgl.js': 'node_modules/@xterm/addon-webgl/lib/addon-webgl.js',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self' data:",
    `connect-src 'self' ws://127.0.0.1:${PORT} ws://localhost:${PORT}`,
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

function hostOk(req) {
  const h = (req.headers.host || '').toLowerCase();
  return h === `127.0.0.1:${PORT}` || h === `localhost:${PORT}`;
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function saveUpload(req, rawName) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > UPLOAD_MAX) { reject(new Error('fichier trop gros (30 Mo max)')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        fs.mkdirSync(UPLOADS, { recursive: true });
        let name = decodeURIComponent(rawName || '') || 'image.png';
        name = path.basename(name).replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'fichier';
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const file = path.join(UPLOADS, `${stamp}-${crypto.randomBytes(3).toString('hex')}-${name}`);
        fs.writeFileSync(file, Buffer.concat(chunks));
        resolve(file);
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

try {
  for (const f of fs.readdirSync(UPLOADS)) {
    const full = path.join(UPLOADS, f);
    if (Date.now() - fs.statSync(full).mtimeMs > 7 * 86400e3) fs.unlinkSync(full);
  }
} catch { }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const ROUTES = [];
function route(method, re, fn) { ROUTES.push({ method, re, fn }); }

const server = http.createServer(async (req, res) => {
  if (!hostOk(req)) { res.writeHead(403); return res.end('bad host'); }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
      .replace(/__SM_TOKEN__|__CSM_TOKEN__|__ASM_TOKEN__/g, TOKEN)
      .replace(/__SM_VERSION__|__CSM_VERSION__|__ASM_VERSION__/g, (() => {
        try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return ''; }
      })());
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    return res.end(html);
  }
  if (req.method === 'GET' && (STATIC[p] || /^\/[\w.-]+\.(js|css|svg|png)$/.test(p))) {
    const file = STATIC[p] ? path.join(ROOT, STATIC[p]) : path.join(ROOT, 'public', p.slice(1));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    return fs.createReadStream(file).pipe(res);
  }

  if (!p.startsWith('/api/')) { res.writeHead(404); return res.end(); }
  const authHeader = req.headers['x-sm-token'] || req.headers['x-asm-token'] || req.headers['x-csm-token'];
  if (authHeader !== TOKEN) return json(res, 401, { error: 'token' });

  const lockOf = (() => {
    const sm = p.match(/^\/api\/sessions\/(\w+)(\/[\w-]+(?:\/[\w-]+)*)?$/);
    if (sm) { const ls = sessions.get(sm[1]); if (ls?.lock && !['/lock', '/unlock-remove'].includes(sm[2] || '')) return ls; }
    const hx = p.match(/^\/api\/history\/([\w-]+)\//);
    if (hx) return ctx.lockedByConversation?.(hx[1]);
    return null;
  })();
  if (lockOf && !ctx.canAccess?.(lockOf, req)) {
    await new Promise(r => { req.on('end', r); req.on('error', r); req.resume(); });
    return json(res, 423, { error: 'session verrouillée' });
  }

  try {
    if (p === '/api/version' && req.method === 'GET') {
      return json(res, 200, { version: VERSION, pid: process.pid, runtime: process.versions.electron ? 'electron' : 'node' });
    }
    if (p === '/api/upload' && req.method === 'POST') {
      const file = await saveUpload(req, String(req.headers['x-filename'] || ''));
      return json(res, 200, { path: file });
    }
    if (p === '/api/hook' && req.method === 'POST') {
      const { id, sm, asm, csm, event, data } = await readBody(req);
      const targetId = id || sm || asm || csm;
      let s = sessions.get(targetId);
      const convId = data && (data.conversationId || data.session_id);
      if (!s && convId) {
        s = [...sessions.values()].find(x => x.conversationId === convId || x.claudeSessionId === convId);
      }
      if (!s && sessions.size === 1) {
        s = [...sessions.values()][0];
      }
      if (!s) return json(res, 404, {});
      if (convId) {
        if (s.agent === 'agy' && s.conversationId !== convId) {
          s.conversationId = convId;
          s.agentIds = { ...(s.agentIds || {}), agy: convId };
          persist();
        } else if (s.agent !== 'agy' && s.claudeSessionId !== convId) {
          s.claudeSessionId = convId;
          s.agentIds = { ...(s.agentIds || {}), claude: convId };
          persist();
        }
      }
      if (event === 'start') { setStatus(s, 'idle'); emit('start', s); }
      else if (event === 'working') setStatus(s, 'working', data && data.tool_name ? data.tool_name : '');
      else if (event === 'attention') setStatus(s, 'attention', (data && data.message) || 'attend une réponse');
      else if (event === 'idle') {
        setStatus(s, 'idle', 'terminé');
        emit('idle', s);
        const cId = s.conversationId || s.claudeSessionId;
        if (s.named && cId && s.titleFor !== cId && writeCustomTitle(cId, s.name)) {
          s.titleFor = cId; persist();
        }
      }
      broadcast({ t: 'session', s: publicView(s) });
      return json(res, 200, {});
    }
    if (p === '/api/sessions' && req.method === 'GET') return json(res, 200, [...sessions.values()].map(publicView));
    if (p === '/api/sessions' && req.method === 'POST') {
      const b = await readBody(req);
      const lk = b.resume && ctx.lockedByConversation?.(b.resume);
      if (lk && !ctx.canAccess(lk, req)) return json(res, 423, { error: 'conversation d\u2019une session verrouillée' });
      return json(res, 200, publicView(createSession(b)));
    }
    const hm = p.match(/^\/api\/history\/([\w-]+)\/rename$/);
    if (hm && req.method === 'POST') {
      const title = String((await readBody(req)).name || '').trim().slice(0, 80);
      if (!title) return json(res, 400, { error: 'nom vide' });
      const managed = [...sessions.values()].find(s => s.conversationId === hm[1] || s.claudeSessionId === hm[1]);
      if (managed) renameSession(managed, title);
      else if (!writeCustomTitle(hm[1], title)) return json(res, 404, { error: 'conversation introuvable' });
      return json(res, 200, { ok: true });
    }
    if (p === '/api/history' && req.method === 'GET') {
      const managed = new Set([...sessions.values()].map(s => s.conversationId || s.claudeSessionId).filter(Boolean));
      return json(res, 200, history().slice(0, 400).map(h => {
        const lk = ctx.lockedByConversation?.(h.id);
        return lk ? { ...h, managed: true, locked: true, title: `🔒 ${lk.name}`, lastPrompt: '' } : { ...h, managed: managed.has(h.id) };
      }));
    }
    if (p === '/api/external' && req.method === 'GET') return json(res, 200, externalSessions());
    if (p === '/api/import' && req.method === 'POST') {
      const { items, mode } = await readBody(req);
      const done = [], errors = [];
      for (const it of items || []) {
        try { done.push(publicView(await importExternal(Number(it.pid), String(it.sessionId), mode))); }
        catch (e) { errors.push(`${it.title || it.sessionId}: ${e.message}`); }
      }
      return json(res, 200, { done, errors });
    }
    if (p === '/api/pick-folder' && req.method === 'POST') {
      const { initial } = await readBody(req);
      const picked = await pickFolder(initial);
      return json(res, 200, { path: picked });
    }
    if (p === '/api/order' && req.method === 'POST') {
      const { ids } = await readBody(req);
      (ids || []).forEach((id, i) => { const s = sessions.get(id); if (s) s.order = i + 1; });
      persist(); broadcastAll();
      return json(res, 200, {});
    }
    const m = p.match(/^\/api\/sessions\/(\w+)(?:\/(\w+))?$/);
    const s = m && sessions.get(m[1]);
    if (m && !s) return json(res, 404, { error: 'session inconnue' });
    if (s && req.method === 'DELETE' && !m[2]) {
      killSession(s); sessions.delete(s.id); persist();
      broadcast({ t: 'removed', id: s.id });
      return json(res, 200, {});
    }
    if (s && m[2] === 'rename' && req.method === 'POST') {
      const { name } = await readBody(req);
      renameSession(s, name);
      return json(res, 200, publicView(s));
    }
    if (s && m[2] === 'kill' && req.method === 'POST') { s.wantRun = false; persist(); killSession(s); return json(res, 200, {}); }
    if (s && m[2] === 'restart' && req.method === 'POST') {
      killSession(s);
      s.buf += '\x1b[2J\x1b[H';
      broadcast({ t: 'clear', id: s.id });
      spawnSession(s, { resume: (s.agent === 'agy' ? s.conversationId : s.claudeSessionId) || s.conversationId || undefined });
      return json(res, 200, publicView(s));
    }
    if (s && m[2] === 'fork' && req.method === 'POST') {
      const resumeId = s.agent === 'agy' ? s.conversationId : s.claudeSessionId;
      if (!resumeId) return json(res, 400, { error: 'session non démarrée' });
      const forked = createSession({
        cwd: s.cwd, name: `${s.name} (branche)`, resume: resumeId,
        group: s.group, model: s.model, mode: s.mode, effort: s.effort, agent: s.agent
      });
      return json(res, 200, publicView(forked));
    }
    if (s && m[2] === 'seen' && req.method === 'POST') {
      if (s.status === 'idle' && s.message === 'terminé') setStatus(s, 'idle', '');
      return json(res, 200, {});
    }
    if (s && m[2] === 'switch' && req.method === 'POST') {
      const { to } = await readBody(req);
      if (to !== 'claude' && to !== 'agy') return json(res, 400, { error: 'agent cible inconnu (claude|agy)' });
      if (to === s.agent) return json(res, 400, { error: 'la session utilise déjà cet agent' });
      const r = switchAgent(s, to);
      return json(res, 200, { session: publicView(s), brief: r.brief, stats: r.stats });
    }
    if (s && m[2] === 'handoff' && req.method === 'GET') {
      const file = handoff.transcriptFile(s.agent, s.conversationId || s.claudeSessionId || s.id);
      if (!file) return json(res, 404, { error: 'aucun transcript' });
      const built = handoff.buildBriefing({
        file, from: s.agent, to: s.agent === 'agy' ? 'claude' : 'agy', sessionName: s.name, cwd: s.cwd,
      });
      if (!built) return json(res, 404, { error: 'transcript vide' });
      json(res, 200, { markdown: built.markdown, stats: built.stats });
      return;
    }
    for (const r of ROUTES) {
      if (r.method !== req.method) continue;
      const mm = p.match(r.re);
      if (mm) return await r.fn({ req, res, m: mm, url });
    }
    return json(res, 404, { error: 'route' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
});

// ---------------------------------------------------------------- WebSocket
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === 1) c.send(data);
}
function broadcastAll() { broadcast({ t: 'sessions', list: [...sessions.values()].map(publicView) }); }

server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!hostOk(req) || url.pathname !== '/ws' || url.searchParams.get('token') !== TOKEN) { sock.destroy(); return; }
  wss.handleUpgrade(req, sock, head, ws => {
    clients.add(ws);
    ws.send(JSON.stringify({ t: 'sessions', list: [...sessions.values()].map(publicView) }));
    for (const s of sessions.values()) if (s.buf && !s.lock) ws.send(JSON.stringify({ t: 'replay', id: s.id, d: s.buf }));
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (ctx.onWsMessage?.(ws, m)) return;
      const s = sessions.get(m.id);
      if (!s) return;
      if (s.lock && !ctx.wsCan?.(s, ws)) return;
      if (m.t === 'input' && s.pty) {
        s.pty.write(m.d);
        if (m.d === '\x03' || m.d === '\x1b') checkInterruptedSoon(s);
      }
      else if (m.t === 'resize' && m.cols > 10 && m.rows > 3) {
        s.cols = m.cols; s.rows = m.rows;
        if (s.pty) try { s.pty.resize(m.cols, m.rows); } catch { }
      }
    });
    ws.on('close', () => { clients.delete(ws); ctx.onWsClose?.(ws); });
  });
});

// ---------------------------------------------------------------- modules
const listeners = {};
function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
function emit(ev, ...a) { for (const fn of listeners[ev] || []) { try { fn(...a); } catch (e) { console.error('module', ev, e); } } }
const ctx = {
  route, on, emit, json, readBody, sessions, publicView, persist, broadcast, createSession, killSession, spawnSession,
  renameSession, history, transcriptPath, setStatus, DATA, ROOT, PORT, VERSION, CLAUDE, AGY, IS_WIN, IS_MAC, TOKEN_FILE,
};
for (const mod of ['lock', 'git', 'settings', 'usage', 'tools', 'queue', 'agents']) {
  try { require(`./lib/${mod}`)(ctx); } catch (e) { console.error(`module ${mod} :`, e); }
}

server.on('error', e => { console.error('écoute impossible', e.message); process.exit(1); });
server.listen(PORT, HOST, () => {
  fs.writeFileSync(path.join(DATA, 'server.pid'), String(process.pid));
  console.log(`Sessions Manager -> http://${HOST}:${PORT}  (claude: ${CLAUDE}, agy: ${AGY})`);
  restoreSessions();
});

function shutdown() {
  shuttingDown = true;
  persist();
  for (const s of sessions.values()) killSession(s);
  persist();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
