# Sessions Manager

Une seule application pour piloter **Claude Code** (`claude`) et **Antigravity CLI** (`agy`) côte à côte dans une interface fluide, productive et unifiée. **Windows et macOS · libre (MIT).**

**Site web et documentation : [khalilbenaz.github.io/sessions-manager](https://khalilbenaz.github.io/sessions-manager/)** · [Portail Sessions](https://khalilbenaz.github.io/sessions/) · [Journal des versions](CHANGELOG.md)

---

## 🚀 Pourquoi Sessions Manager ?

| Fonctionnalité | Claude Sessions Manager | AGY Sessions Manager | **Sessions Manager (Unifié)** |
|---|:---:|:---:|:---:|
| **Claude Code CLI** (`claude`) | ✅ | ❌ | **✅ Oui** |
| **Antigravity CLI** (`agy`) | ❌ | ✅ | **✅ Oui** |
| **Sélecteur d'agent par session** | ❌ | ❌ | **✅ Oui (`[ 🧡 Claude ]` / `[ 🔷 AGY ]`)** |
| **Filtrage dans la barre latérale** | ❌ | ❌ | **✅ Oui (`Tous`, `Claude`, `AGY`)** |
| **Historique croisé et reprise auto** | Claude seul | AGY seul | **✅ Unifié (détection automatique de l'agent)** |
| **Dispositions multi-panneaux (1, 2, 4)** | ✅ | ✅ | **✅ Oui (mélangez Claude & AGY)** |
| **Worktrees Git dédiés** | ✅ | ✅ | **✅ Oui** |
| **Verrouillage par mot de passe** | ✅ | ✅ | **✅ Oui** |
| **Ligne de commande unifiée** | `csm` | `asm` | **`sm` & `sessions`** |

---

## Sommaire

1. [Installation](#1-installation)
2. [Premiers pas](#2-premiers-pas)
3. [L'écran principal & le filtrage multi-agents](#3-lécran-principal--le-filtrage-multi-agents)
4. [Gestion des sessions & choix de l'agent](#4-gestion-des-sessions--choix-de-lagent)
5. [Ranger : groupes, épinglage, couleurs](#5-ranger--groupes-épinglage-couleurs)
6. [Vue partagée (Split View 1, 2, 4 panneaux)](#6-vue-partagée-split-view-1-2-4-panneaux)
7. [Worktrees git : plusieurs sessions sans conflit](#7-worktrees-git--plusieurs-sessions-sans-conflit)
8. [Panneau Modifications, Chronologie, Consommation](#8-panneau-modifications-chronologie-consommation)
9. [Historique unifié (Claude Code & Antigravity)](#9-historique-unifié-claude-code--antigravity)
10. [Images, captures d'écran et fichiers](#10-images-captures-décran-et-fichiers)
11. [Palette, prompts, file d'attente, envoi groupé](#11-palette-prompts-file-dattente-envoi-groupé)
12. [Modèles de session](#12-modèles-de-session)
13. [Verrouiller une session par mot de passe](#13-verrouiller-une-session-par-mot-de-passe)
14. [Notifications, zone de notification, arrière-plan](#14-notifications-zone-de-notification-arrière-plan)
15. [Réglages & gestion des CLIs](#15-réglages--gestion-des-clis)
16. [Raccourcis clavier](#16-raccourcis-clavier)
17. [Ligne de commande `sm`](#17-ligne-de-commande-sm)

---

## 1. Installation

Prérequis : au moins l'un des deux agents installé :
- **Claude Code CLI** (`claude`) : `npm install -g @anthropic-ai/claude-code` (ou via `sm install-claude`)
- **Antigravity CLI** (`agy`) : installé via `curl -fsSL https://antigravity.google/cli/install.sh | bash`

### Application de bureau (Electron)

| Système | Fichier ([Releases GitHub](https://github.com/khalilbenaz/sessions-manager/releases/latest)) | Installation |
|---|---|---|
| Windows 10 / 11 | `Sessions-Manager-Setup-x.y.z.exe` | Double-clic ; installation en un clic sans droits admin |
| macOS Apple Silicon (M1…M4) | `Sessions-Manager-x.y.z-arm64.dmg` | Ouvrir, glisser **Sessions Manager** dans Applications |
| macOS Intel | `Sessions-Manager-x.y.z-x64.dmg` | Idem |

### Via npm (CLI universelle)

```bash
git clone https://github.com/khalilbenaz/sessions-manager.git
cd sessions-manager
npm install
npm link
sm install    # Configure le démarrage auto et ouvre l'interface
```

---

## 2. Premiers pas

1. Lancez **Sessions Manager** (ou tapez `sm` dans un terminal).
2. Cliquez sur **+ Nouvelle** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> ou <kbd>⌥</kbd>+<kbd>⌃</kbd>+<kbd>N</kbd>) :
   - Choisissez l'agent souhaité en un clic : **🧡 Claude Code** ou **🔷 Antigravity**.
   - Choisissez votre dossier de travail (*Parcourir…*).
   - Les options de modèle et d'effort s'adaptent instantanément à l'agent sélectionné.
   - Cliquez sur **Lancer**.
3. Vos sessions tournent en parallèle dans la même fenêtre, avec un indicateur clair de leur agent (`🧡 Claude` ou `🔷 AGY`).

---

## 3. L'écran principal & le filtrage multi-agents

```
┌─ barre latérale ────────┬─ barre de la session active ────────────────────────────────────────┐
│ + Nouvelle              │ ● 🧡 Claude  Projet Web ✎  ⎇ main  dossier  état   ▢◫⊟⊞  ± Modifs   │
│ Rechercher…   Ctrl+K    │                                         Joindre  Reprendre  ⋯  ✕     │
│ [Tous] [🧡 Claude] [🔷] │├──────────────────────────────────────────────────┬──────────────────┤
│ ─ ÉPINGLÉES ─       1   │                                                  │ panneau latéral  │
│ ● 🧡 Backend API        │   terminal de la session (ou 2 / 4 panneaux)     │  Modifications   │
│ ─ FRONTEND ─        2   │                                                  │  Chronologie     │
│ ● 🔷 Refactor UI (AGY)  │                                                  │  Consommation    │
│ ● 🧡 Tests Playwright   │                                                  │                  │
│ Historique   ⚙   ⇤      │                                                  │                  │
└─────────────────────────┴──────────────────────────────────────────────────┴──────────────────┘
```

- **Filtres de la barre latérale** : filtrez vos sessions actives d'un clic avec `[ Tous ]`, `[ 🧡 Claude ]` ou `[ 🔷 AGY ]`.
- **Badges d'agent** : chaque élément affiche un badge visuel net pour ne jamais confondre vos agents.
- **Barre supérieure** : indique l'agent en cours d'exécution, la branche git (si worktree) et l'état en temps réel.

---

## 4. Gestion des sessions & choix de l'agent

### États en temps réel
- 🟠 **Orange (pulsant)** : l'agent réfléchit, génère du code ou exécute un outil.
- 🔴 **Rouge (alerte)** : l'agent attend une validation ou une réponse de votre part.
- 🟢 **Vert** : l'agent est prêt.
- ⚪ **Cercle** : session arrêtée. Cliquez sur « Reprendre » pour reprendre la conversation.

### Cycle de vie & hooks universels
- Les événements Claude Code sont gérés via injection automatique de `--settings hooks-settings.json`.
- Les événements Antigravity CLI sont gérés via le hook runner officiel dans `~/.gemini/config/hooks.json`.
- Aucune collision de configuration, même si les deux agents tournent simultanément.

---

## 5. Vue partagée (Split View)

Affichez plusieurs terminaux simultanément :
- **▢ 1 panneau** : plein écran sur la session active.
- **◫ 2 colonnes** : deux sessions côte à côte (ex. Claude sur l'API, AGY sur le frontend).
- **⊟ 2 lignes** : vue haute et basse.
- **⊞ Grille 2×2** : 4 sessions simultanées.

---

## 6. Historique unifié

Appuyez sur <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd> :
- Accédez à l'historique complet de vos conversations Claude Code (`~/.claude/projects`) et Antigravity (`~/.gemini/antigravity-cli/brain` & `history.jsonl`).
- Filtrez par agent avec `[ Tous ]`, `[ 🧡 Claude ]`, `[ 🔷 AGY ]`.
- Cliquez sur n'importe quelle session passée : elle est reprise immédiatement avec le bon agent !

---

## 7. Ligne de commande `sm`

| Commande | Action |
|---|---|
| `sm` | Ouvre l'interface de bureau (lance le serveur si besoin) |
| `sm status` | Affiche l'état du serveur et la détection des deux CLIs |
| `sm install` | Configure le lancement automatique au démarrage |
| `sm uninstall` | Retire le lancement automatique |
| `sm install-claude` | Installe / met à jour Claude Code via npm |
| `sm update-agy` | Recherche et applique la mise à jour d'Antigravity CLI |
| `sm restart` | Redémarre le serveur local |
| `sm stop` | Arrête le serveur (les sessions seront restaurées au prochain lancement) |
| `sm log` | Affiche les dernières lignes du journal serveur |

---

## 8. Raccourcis clavier essentiels

| Raccourci | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> | Nouvelle session |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Palette de commandes universelle |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd> | Historique des conversations |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd> | Panneau Git Modifications |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> | Renommer la session |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Ouvrir les Réglages |
| <kbd>Ctrl</kbd>+<kbd>1..9</kbd> | Sélection directe d'une session |

---

## Licence

Logiciel libre sous licence [MIT](LICENSE).
Développé avec soin par [Khalil Benazouz](https://github.com/khalilbenaz).
