'use strict';
// Emplacements et réglages communs au serveur et à la CLI, par OS.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// --port=N (utilisé par la tâche planifiée / le LaunchAgent, qui ne transmettent pas d'environnement) ou SM_PORT.
const argPort = (process.argv.find(a => a.startsWith('--port=')) || '').slice(7);
const PORT = Number(argPort || process.env.SM_PORT || process.env.ASM_PORT || 7895);
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

function defaultDataDir() {
  if (IS_WIN) return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'sessions-manager');
  if (IS_MAC) return path.join(os.homedir(), 'Library', 'Application Support', 'sessions-manager');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'sessions-manager');
}
// Un port non standard a ses propres données (permet de tester sans toucher l'instance principale).
const DATA = process.env.SM_DATA || process.env.ASM_DATA || process.env.CSM_DATA || (PORT === 7895 ? defaultDataDir() : `${defaultDataDir()}-${PORT}`);
const LEGACY_DATA = path.join(ROOT, 'data');

// Même nom d'instance pour la tâche planifiée / le LaunchAgent / le raccourci.
const SUFFIX = PORT === 7895 ? '' : ` ${PORT}`;
const TASK_NAME = `Sessions Manager${SUFFIX}`;
const LAUNCHD_LABEL = PORT === 7895 ? 'com.sessions-manager.server' : `com.sessions-manager.server.${PORT}`;
const APP_NAME = `Sessions Manager${SUFFIX}`;

// Répertoires des données Claude Code
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

// Répertoires des données Antigravity (agy)
const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
const AGY_HISTORY_FILE = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'history.jsonl');
const GEMINI_CONFIG_DIR = path.join(os.homedir(), '.gemini', 'config');

function which(cmd) {
  try {
    const out = execFileSync(IS_WIN ? 'where' : 'which', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split(/\r?\n/).map(s => s.trim()).find(Boolean) || null;
  } catch { return null; }
}

function stablePath(p) {
  if (!p || !/fnm_multishells/.test(p)) return p;
  try { return path.join(fs.realpathSync(path.dirname(p)), path.basename(p)); } catch { return p; }
}

// Résolution de Claude Code CLI
function resolveClaude() {
  if (process.env.SM_CLAUDE || process.env.CSM_CLAUDE) return process.env.SM_CLAUDE || process.env.CSM_CLAUDE;
  const found = which('claude');
  if (found) return stablePath(found);
  const home = os.homedir();
  const candidates = IS_WIN
    ? [path.join(home, '.local', 'bin', 'claude.exe'), path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')]
    : [path.join(home, '.local', 'bin', 'claude'), path.join(home, '.claude', 'local', 'claude'),
      '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || 'claude';
}

// Résolution d'Antigravity CLI (agy)
function resolveAgy() {
  if (process.env.SM_AGY || process.env.ASM_AGY) return process.env.SM_AGY || process.env.ASM_AGY;
  const found = which('agy');
  if (found) return stablePath(found);
  const home = os.homedir();
  const candidates = IS_WIN
    ? [path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe'), path.join(home, '.local', 'bin', 'agy.exe'), path.join(process.env.APPDATA || '', 'npm', 'agy.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'agy', 'agy.exe')]
    : [path.join(home, '.local', 'bin', 'agy'), '/opt/homebrew/bin/agy', '/usr/local/bin/agy'];
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || 'agy';
}

function hasClaude() {
  const p = resolveClaude();
  try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return p !== 'claude'; }
}

function hasAgy() {
  const p = resolveAgy();
  try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return p !== 'agy'; }
}

module.exports = {
  stablePath, ROOT, PORT, IS_WIN, IS_MAC, DATA, LEGACY_DATA,
  TASK_NAME, LAUNCHD_LABEL, APP_NAME, which,
  resolveClaude, resolveAgy, hasClaude, hasAgy,
  CLAUDE_DIR, CLAUDE_HISTORY_FILE, CLAUDE_PROJECTS_DIR,
  BRAIN_DIR, AGY_HISTORY_FILE, GEMINI_CONFIG_DIR
};
