'use strict';
// Faux agy pour les tests : même interface que agy pour AGY Sessions
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
if (argv.includes('--version')) { console.log('0.0.0 (faux agy)'); process.exit(0); }

const resume = opt('--conversation');
const sessionId = resume || crypto.randomUUID();
const cwd = process.cwd();

const home = process.env.HOME || os.homedir();
const brainDir = path.join(home, '.gemini', 'antigravity-cli', 'brain', sessionId, '.system_generated', 'logs');
fs.mkdirSync(brainDir, { recursive: true });
const transcript = path.join(brainDir, 'transcript.jsonl');

const log = o => fs.appendFileSync(transcript, JSON.stringify({ ...o, conversationId: sessionId, created_at: new Date().toISOString() }) + '\n');

const hookScript = path.join(__dirname, '..', 'hook.js');
function hook(ev, data = {}) {
  return new Promise(res => {
    const p = exec(`node "${hookScript}" ${ev}`, { env: process.env }, () => res());
    p.stdin.end(JSON.stringify({ conversationId: sessionId, hook_event_name: ev, cwd, ...data }));
  });
}

const out = s => process.stdout.write(s);
let turn = 0;
let pending = null;

async function prompt(text) {
  turn++;
  log({ source: 'USER_EXPLICIT', type: 'USER_INPUT', content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>` });
  await hook('PreInvocation', { prompt: text });
  await hook('PreToolUse', { toolCall: { name: 'list_dir', args: { DirectoryPath: cwd } } });

  if (/longue/.test(text)) { pending = 'long'; out('\r\n✻ réfléchit…'); return; }
  if (/demande/.test(text)) { pending = 'ask'; await hook('PreToolUse', { message: 'Antigravity attend confirmation' }); out('\r\nDo you want to proceed? ❯ 1. Yes'); return; }

  const reply = `echo: ${text}`;
  log({ source: 'MODEL', type: 'PLANNER_RESPONSE', content: reply, tool_calls: [{ name: 'view_file', args: { AbsolutePath: path.join(cwd, 'README.md') } }] });
  if (/touch (\S+)/.test(text)) fs.writeFileSync(path.join(cwd, RegExp.$1), `créé par le faux agy (${turn})\n`);
  out(`\r\n● ${reply}\r\n`);
  await hook('Stop');
  out('\r\n❯ ');
}

(async () => {
  await hook('SessionStart', { source: resume ? 'resume' : 'startup' });
  out(`FAUX AGY prêt ${resume ? '(reprise ' + resume.slice(0, 8) + ')' : ''} — session ${sessionId}\r\n❯ `);

  let buf = '';
  process.stdin.setRawMode?.(true);
  process.stdin.on('data', d => {
    buf += d.toString('utf8');
    buf = buf.replace(/\x1b\[20[01]~/g, '');
    if (pending === 'long' && buf.includes('\x03')) {
      buf = ''; pending = null;
      hook('Stop').then(() => out('\r\n  ⎿ Interrompu\r\n❯ '));
      return;
    }
    if (pending === 'ask' && /[\r\n]/.test(buf)) { buf = ''; pending = null; hook('Stop').then(() => out('\r\n❯ ')); return; }
    let i;
    while ((i = buf.search(/[\r\n]/)) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line === '/exit') { hook('Stop').then(() => process.exit(0)); return; }
      if (line) prompt(line);
    }
  });
})();
