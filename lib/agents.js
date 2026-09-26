'use strict';
// Gestion de la détection, version et installation des deux agents : Claude Code et Antigravity CLI.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec, execFile } = require('child_process');
const { resolveClaude, resolveAgy, IS_WIN } = require('./config');

function getClaudePath() {
  const p = resolveClaude();
  try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch { }
  return p === 'claude' ? null : p;
}

function getClaudeVersion() {
  const claude = getClaudePath() || 'claude';
  return new Promise(resolve => {
    execFile(claude, ['--version'], { timeout: 10000, encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve(null);
      const m = (stdout || '').trim().match(/\b\d+\.\d+\.\d+\b/);
      resolve(m ? m[0] : (stdout || '').trim() || null);
    });
  });
}

function installClaude(logger = console.log) {
  return new Promise((resolve, reject) => {
    logger('[claude-cli] Installation de Claude Code via npm...');
    const cmd = 'npm install -g @anthropic-ai/claude-code';
    exec(cmd, { timeout: 180000 }, (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      if (err) {
        logger(`[claude-cli] ✕ Échec : ${err.message}`);
        return reject(new Error(`Échec de l'installation de claude : ${out}`));
      }
      logger('[claude-cli] ✓ Claude Code installé avec succès.');
      resolve({ ok: true, output: out });
    });
  });
}

function getAgyPath() {
  const p = resolveAgy();
  try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch { }
  return p === 'agy' ? null : p;
}

function getAgyVersion() {
  const agy = getAgyPath() || 'agy';
  return new Promise(resolve => {
    execFile(agy, ['--version'], { timeout: 10000, encoding: 'utf8' }, (err, stdout) => {
      if (err) return resolve(null);
      const m = (stdout || '').trim().match(/\b\d+\.\d+\.\d+\b/);
      resolve(m ? m[0] : (stdout || '').trim() || null);
    });
  });
}

function installAgy(logger = console.log) {
  return new Promise((resolve, reject) => {
    logger('[agy-cli] Démarrage de l\'installation d\'Antigravity CLI...');
    const cmd = IS_WIN
      ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb https://antigravity.google/cli/install.ps1 | iex"'
      : 'curl -fsSL https://antigravity.google/cli/install.sh | bash';

    const child = exec(cmd, {
      env: {
        ...process.env,
        PATH: `${path.join(os.homedir(), '.local', 'bin')}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
      },
      timeout: 300000
    });

    let output = '';
    child.stdout?.on('data', d => { output += d; logger(`[agy-install] ${d.toString().trim()}`); });
    child.stderr?.on('data', d => { output += d; logger(`[agy-install:err] ${d.toString().trim()}`); });

    child.on('close', code => {
      if (code === 0) {
        logger('[agy-cli] ✓ Antigravity CLI installé avec succès.');
        resolve({ ok: true, output });
      } else {
        logger(`[agy-cli] ✕ Échec de l'installation (code ${code})`);
        reject(new Error(`Installation de agy échouée avec le code ${code} : ${output.slice(-300)}`));
      }
    });

    child.on('error', err => reject(err));
  });
}

function updateAgy(logger = console.log) {
  return new Promise(async (resolve, reject) => {
    const agy = getAgyPath();
    if (!agy) {
      logger('[agy-cli] Antigravity CLI non détecté. Lancement de l\'installation...');
      try { return resolve(await installAgy(logger)); } catch (e) { return reject(e); }
    }

    logger(`[agy-cli] Recherche de mise à jour d'Antigravity CLI (${agy} update)...`);
    execFile(agy, ['update'], {
      timeout: 180000,
      env: {
        ...process.env,
        PATH: `${path.join(os.homedir(), '.local', 'bin')}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
      }
    }, (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      if (err) {
        logger(`[agy-cli] Note lors de agy update : ${err.message}`);
        installAgy(logger).then(resolve).catch(reject);
        return;
      }
      logger(`[agy-cli] Résultat mise à jour agy : ${out.trim()}`);
      resolve({ ok: true, output: out.trim() });
    });
  });
}

let agyQuotaCache = { data: null, timestamp: 0 };

function getAgyQuota(force = false) {
  const now = Date.now();
  if (!force && agyQuotaCache.data && (now - agyQuotaCache.timestamp < 60000)) {
    return Promise.resolve(agyQuotaCache.data);
  }

  const agy = getAgyPath() || 'agy';
  return new Promise(resolve => {
    execFile(agy, ['-p', '/usage'], {
      timeout: 15000,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(os.homedir(), '.local', 'bin')}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
      }
    }, (err, stdout) => {
      if (err) {
        return resolve(agyQuotaCache.data || { ok: false, error: err.message, quotas: [] });
      }

      const lines = (stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
      const quotas = [];
      for (const line of lines) {
        const parts = line.split(/\t+/);
        if (parts.length >= 4) {
          const category = parts[0].trim();
          const limitName = parts[1].trim();
          const pctMatch = parts[2].match(/(\d+)%/);
          const remainingPercent = pctMatch ? parseInt(pctMatch[1], 10) : null;
          const resetIso = parts[3].trim();
          const resetTime = Date.parse(resetIso);
          quotas.push({
            category,
            limitName,
            remainingPercent,
            usedPercent: remainingPercent != null ? 100 - remainingPercent : null,
            resetIso,
            resetTime: isNaN(resetTime) ? null : resetTime
          });
        }
      }

      const result = {
        ok: true,
        updatedAt: now,
        raw: stdout.trim(),
        quotas
      };
      agyQuotaCache = { data: result, timestamp: now };
      resolve(result);
    });
  });
}

// Quota Claude Code : `claude -p /usage` renvoie un rapport texte.
// Exemple : « Current session: 1% used · resets Sep 26 at 4:29am (Africa/Casablanca) »
let claudeQuotaCache = { data: null, timestamp: 0 };

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** « Sep 26 at 4:29am » → epoch, en déduisant l'année la plus proche. */
function parseReset(str) {
  if (!str) return null;
  const m = String(str).match(/([A-Za-z]{3,})\w*\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m || MONTHS[m[1].slice(0, 3).toLowerCase()] === undefined) return null;
  let h = +m[3];
  const min = +(m[4] || 0);
  if (m[5] && /pm/i.test(m[5]) && h < 12) h += 12;
  if (m[5] && /am/i.test(m[5]) && h === 12) h = 0;
  const now = new Date();
  const d = new Date(now.getFullYear(), MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], h, min, 0, 0);
  if (d.getTime() < now.getTime() - 86400e3) d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

function getClaudeQuota(force = false) {
  const now = Date.now();
  if (!force && claudeQuotaCache.data && (now - claudeQuotaCache.timestamp < 60000)) {
    return Promise.resolve(claudeQuotaCache.data);
  }
  const claude = getClaudePath() || 'claude';
  return new Promise(resolve => {
    execFile(claude, ['-p', '/usage'], {
      timeout: 60000,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      cwd: os.homedir()
    }, (err, stdout, stderr) => {
      const out = String(stdout || '');
      if (err && !out) {
        // Un CLI trop ancien ne connaît pas /usage : message clair plutôt qu'une erreur brute.
        const msg = /Unknown skill|Unknown command|not a|no such/i.test(String(stderr || ''))
          ? `installed CLI does not support /usage`
          : err.message;
        return resolve(claudeQuotaCache.data || { ok: false, error: msg, quotas: [] });
      }
      const quotas = [];
      for (const raw of out.split('\n')) {
        const line = raw.trim();
        const m = line.match(/^(.+?):\s*(\d+(?:[.,]\d+)?)%\s*used(?:\s*[·•]\s*resets\s+(.+?))?$/i);
        if (!m) continue;
        const usedPercent = parseFloat(m[2].replace(',', '.'));
        if (!isFinite(usedPercent)) continue;
        const resetTime = parseReset(m[3]);
        quotas.push({
          category: 'Claude Code',
          limitName: m[1].trim(),
          usedPercent,
          remainingPercent: Math.max(0, Math.round((100 - usedPercent) * 10) / 10),
          resetIso: resetTime ? new Date(resetTime).toISOString() : null,
          resetTime
        });
      }
      const result = { ok: quotas.length > 0, updatedAt: now, raw: out.trim(), quotas };
      claudeQuotaCache = { data: result, timestamp: now };
      resolve(result);
    });
  });
}

// Liste réelle des modèles Antigravity : `agy models` (aucun quota consommé).
// Sans cela l'interface afficherait une liste figée, vite périmée.
let agyModelsCache = { data: null, timestamp: 0 };

function getAgyModels(force = false) {
  const now = Date.now();
  if (!force && agyModelsCache.data && (now - agyModelsCache.timestamp < 6 * 3600e3)) {
    return Promise.resolve(agyModelsCache.data);
  }
  const agy = getAgyPath() || 'agy';
  return new Promise(resolve => {
    execFile(agy, ['models'], {
      timeout: 20000,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.join(os.homedir(), '.local', 'bin')}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
      }
    }, (err, stdout) => {
      if (err) return resolve(agyModelsCache.data || { ok: false, error: err.message, models: [] });
      const models = [];
      for (const line of String(stdout || '').split('\n')) {
        const t = line.trim();
        if (!t || /^Fetching/i.test(t)) continue;
        const m = t.match(/^([\w.-]+)\s*(.*)$/);
        if (m && /^(gemini|claude|gpt|o[0-9]|qwen|deepseek)/i.test(m[1])) {
          models.push({ value: m[1], label: m[2].trim() || m[1] });
        }
      }
      const result = { ok: true, updatedAt: now, models };
      agyModelsCache = { data: result, timestamp: now };
      resolve(result);
    });
  });
}

// Module serveur : enregistre les routes API pour les 2 agents
module.exports = function registerAgents(ctx) {
  const { route, json } = ctx;
  const log = ctx.log || (m => console.log(m));

  route('GET', '/api/agents/status', async ({ res }) => {
    const [claudeVersion, agyVersion] = await Promise.all([
      getClaudeVersion(),
      getAgyVersion()
    ]);
    json(res, 200, {
      claude: {
        installed: !!claudeVersion,
        path: getClaudePath() || 'claude',
        version: claudeVersion
      },
      agy: {
        installed: !!agyVersion,
        path: getAgyPath() || 'agy',
        version: agyVersion
      }
    });
  });

  const quotaHandler = async ({ res, req }) => {
    const force = req.url.includes('force=true') || req.url.includes('refresh=1');
    const data = await getAgyQuota(force);
    json(res, 200, data);
  };
  route('GET', '/api/agents/agy/quota', quotaHandler);
  route('GET', '/api/agy/quota', quotaHandler);

  const modelsHandler = async ({ res, req }) => {
    const force = req.url.includes('force=true') || req.url.includes('refresh=1');
    json(res, 200, await getAgyModels(force));
  };
  route('GET', '/api/agents/agy/models', modelsHandler);
  route('GET', '/api/agy/models', modelsHandler);

  const claudeQuotaHandler = async ({ res, req }) => {
    const force = req.url.includes('force=true') || req.url.includes('refresh=1');
    json(res, 200, await getClaudeQuota(force));
  };
  route('GET', '/api/agents/claude/quota', claudeQuotaHandler);
  route('GET', '/api/claude/quota', claudeQuotaHandler);

  route('POST', '/api/agents/install-claude', async ({ res }) => {
    try {
      const result = await installClaude(log);
      const version = await getClaudeVersion();
      json(res, 200, { ok: true, version, output: result.output });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
  });

  route('POST', '/api/agents/update-agy', async ({ res }) => {
    try {
      const result = await updateAgy(log);
      const version = await getAgyVersion();
      json(res, 200, { ok: true, version, output: result.output });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
  });

  // Tâche de fond automatique pour agy (toutes les 6h)
  setTimeout(() => {
    updateAgy(m => log(`[auto-update] ${m}`)).catch(() => {});
    setInterval(() => {
      updateAgy(m => log(`[auto-update] ${m}`)).catch(() => {});
    }, 6 * 3600 * 1000);
  }, 10000);
};

module.exports.getClaudePath = getClaudePath;
module.exports.getClaudeVersion = getClaudeVersion;
module.exports.installClaude = installClaude;
module.exports.getAgyPath = getAgyPath;
module.exports.getAgyVersion = getAgyVersion;
module.exports.installAgy = installAgy;
module.exports.updateAgy = updateAgy;
module.exports.getAgyQuota = getAgyQuota;
