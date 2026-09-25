# Journal des versions — AGY Sessions

## 1.0.0 — 2026-09-25

- Première version d'**AGY Sessions** (fork et adaptation de Claude Sessions Manager pour Antigravity CLI).
- Support complet du mode interactif PTY avec émulation `xterm.js`.
- Reprise automatique et persistante des sessions (`agy --conversation <id>`).
- Intégration des hooks Antigravity (`PreInvocation`, `PreToolUse`, `Stop`) pour l'affichage en direct des états d'activité.
- Sélecteur de modèles (Gemini 3.8 Flash, Gemini 3.1 Pro, Claude Sonnet 4.6, GPT-OSS, etc.), modes (`accept-edits`, `plan`, `dangerously-skip-permissions`) et niveaux de raisonnement (effort).
- Gestion des worktrees Git dédiés avec panneau de diff et commit interactif.
- File d'attente de prompts et diffusion groupée.
- Verrouillage confidentiel par mot de passe.
- Palette de commandes (<kbd>Ctrl+K</kbd> / <kbd>Cmd+K</kbd>).
- CLI `asm` (démarrage, arrêt, statut, installation en service d'ouverture de session).
