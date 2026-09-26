# Journal des versions — Sessions Manager

## 1.0.3 — 2026-09-26

- **Quotas exclusifs par agent** : l'onglet Consommation et le dialogue Quotas n'affichent plus que les quotas de l'agent actif (Claude si session Claude, Antigravity si session AGY).
- **Modèle Claude Opus 5.5** : ajout de `claude-opus-5-5` dans les sélecteurs de modèles et support de la saisie personnalisée (`✏️ Autre modèle…`).
- **Bouton Redémarrer** : rétablissement du libellé explicite « Redémarrer », protection contre le débordement CSS et ajout dans le menu d'actions contextuel.
- **Redémarrage natif de l'application** : support du canal IPC `relaunchApp` et détection du mismatch application/serveur avec proposition directe de relance.
- **Support Linux complet** : packages Ubuntu (`.deb`) et universels (`.AppImage`) avec workflow de release automatisé.

## 1.0.2 — 2026-09-26

- Support et génération des paquets Linux (`.deb` et `.AppImage`).
- Synchronisation dynamique des quotas et renforcement de l'étanchéité des hooks lors de la bascule d'agent.

## 1.0.1 — 2026-09-26

- Affichage du modèle en inline dans la barre d'en-tête avec sélecteur interactif.
- Quotas dynamiques et corrections sur l'auto-updater.

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
