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
