# Sessions Manager

Une seule application pour piloter **Claude Code** (`claude`) et **Antigravity CLI** (`agy`) côte à côte dans une interface fluide, productive et unifiée. **Windows, macOS et Linux / Ubuntu · libre (MIT).**

**Site web et documentation : [khalilbenaz.github.io/sessions-manager](https://khalilbenaz.github.io/sessions-manager/)** · [Portail Sessions](https://khalilbenaz.github.io/sessions/) · [Journal des versions](CHANGELOG.md)

---

## 🚀 Pourquoi Sessions Manager ?

| Fonctionnalité | Claude Sessions Manager | AGY Sessions Manager | **Sessions Manager (Unifié)** |
|---|:---:|:---:|:---:|
| **Claude Code CLI** (`claude`) | ✅ | ❌ | **✅ Oui** |
| **Antigravity CLI** (`agy`) | ❌ | ✅ | **✅ Oui** |
| **Bascule d'agent en direct (Handoff)** | ❌ | ❌ | **✅ Oui (briefing Markdown & reprise auto)** |
| **Modèle affiché en inline & sélecteur** | ❌ | ❌ | **✅ Oui (dans la barre d'en-tête)** |
| **Quotas en direct Claude & AGY** | Claude seul | AGY seul | **✅ Oui (synchronisés avec l'agent actif)** |
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
3. [L'écran principal & la barre de session](#3-lécran-principal--la-barre-de-session)
4. [Gestion des sessions & bascule d'agent (Handoff)](#4-gestion-des-sessions--bascule-dagent-handoff)
5. [Quotas & Consommation en temps réel](#5-quotas--consommation-en-temps-réel)
6. [Vue partagée (Split View 1, 2, 4 panneaux)](#6-vue-partagée-split-view-1-2-4-panneaux)
7. [Panneau latéral : Modifications Git & Chronologie](#7-panneau-latéral--modifications-git--chronologie)
8. [Historique unifié (Claude Code & Antigravity)](#8-historique-unifié-claude-code--antigravity)
9. [Ligne de commande `sm`](#9-ligne-de-commande-sm)
10. [Raccourcis clavier essentiels](#10-raccourcis-clavier-essentiels)

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
| Ubuntu / Debian (x64) | `Sessions-Manager-x.y.z-amd64.deb` | `sudo dpkg -i Sessions-Manager-*.deb` |
| Linux universel (x64) | `Sessions-Manager-x.y.z-x86_64.AppImage` | `chmod +x Sessions-Manager-*.AppImage && ./Sessions-Manager-*.AppImage` |

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

## 3. L'écran principal & la barre de session

```
┌─ barre latérale ────────┬─ barre de la session active ────────────────────────────────────────────────────────┐
│ + Nouvelle              │ ● 🧡 Claude  Projet Web ✎  [Claude Opus 5.5 ▾]  ⎇ main  dossier   📊 Quota   ± Modifs│
│ Rechercher…   Ctrl+K    │                                                     🔀 Basculer  Redémarrer  ⋯  ✕│
│ [Tous] [🧡 Claude] [🔷] │├──────────────────────────────────────────────────────────────┬─────────────────────┤
│ ─ ÉPINGLÉES ─       1   │                                                              │ panneau latéral     │
│ ● 🧡 Backend API        │   terminal de la session (ou 2 / 4 panneaux)                 │  Modifications      │
│ ─ FRONTEND ─        2   │                                                              │  Chronologie        │
│ ● 🔷 Refactor UI (AGY)  │                                                              │  Consommation       │
│ ● 🧡 Tests Playwright   │                                                              │                     │
│ Historique   ⚙   ⇤      │                                                              │                     │
└─────────────────────────┴──────────────────────────────────────────────────────────────┴─────────────────────┘
```

- **Filtres de la barre latérale** : filtrez vos sessions actives d'un clic avec `[ Tous ]`, `[ 🧡 Claude ]` ou `[ 🔷 AGY ]`.
- **Badges d'agent** : chaque élément affiche un badge visuel net pour ne jamais confondre vos agents.
- **Affichage du modèle en inline** : visualisez en permanence le modèle en cours d'exécution dans la barre supérieure (**Claude Opus 5.5**, Sonnet, Haiku, Gemini Flash / Pro, ou n'importe quel modèle personnalisé via *✏️ Autre modèle…*). Un clic dessus ouvre un sélecteur instantané.
- **Barre supérieure réactive** : indique l'agent actif, le modèle, la branche git (si worktree), l'état en temps réel, ainsi que le bouton **Redémarrer** toujours accessible.

---

## 4. Gestion des sessions & bascule d'agent (Handoff)

### États en temps réel
- 🟠 **Orange (pulsant)** : l'agent réfléchit, génère du code ou exécute un outil.
- 🔴 **Rouge (alerte)** : l'agent attend une validation ou une réponse de votre part.
- 🟢 **Vert** : l'agent est prêt.
- ⚪ **Cercle** : session arrêtée. Cliquez sur **Redémarrer** pour relancer ou reprendre la conversation.

### Bascule d'agent transparente (Handoff Claude ⇄ Antigravity)
- Cliquez sur le bouton **🔀 Basculer vers...** (ou <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd>) pour passer instantanément d'un agent à l'autre dans la même session.
- **Transmission intelligente du contexte** : Sessions Manager génère automatiquement un briefing Markdown complet résumant les tours précédents, les décisions prises et les fichiers touchés.
- **Reprise sans collision** : si vous revenez à un agent déjà utilisé dans la session, sa conversation historique est reprise proprement et complétée avec le briefing du tour intermédiaire.
- **Isolation étanche** : les processus PTY et les hooks universels reçoivent la variable `SM_AGENT` pour garantir qu'aucun identifiant de conversation n'est croisé ou corrompu.

---

## 5. Quotas & Consommation en temps réel

Sessions Manager surveille vos quotas et consommations avec affichage exclusif de l'agent actif :
- **Bouton 📊 Quota** (barre d'en-tête) : ouvre une modale détaillée avec les jauges d'utilisation, le pourcentage restant et la date de réinitialisation pour l'agent de la session active (Claude Code ou Antigravity).
- **Onglet Consommation** (panneau latéral droit) :
  - Affiche exclusivement les **Quotas Claude Code** ou les **Quotas Antigravity** correspondant à l'agent de la session en cours.
  - Bouton de rafraîchissement dédié `⟳` pour forcer l'actualisation sans attendre le cache.
  - Statistiques de tokens d'entrée, de sortie et coût estimé par modèle et par jour.

---

## 6. Vue partagée (Split View 1, 2, 4 panneaux)

Affichez plusieurs terminaux simultanément :
- **▢ 1 panneau** : plein écran sur la session active.
- **◫ 2 colonnes** : deux sessions côte à côte (ex. Claude sur l'API, AGY sur le frontend).
- **⊟ 2 lignes** : vue haute et basse.
- **⊞ Grille 2×2** : 4 sessions simultanées.

---

## 7. Panneau latéral : Modifications Git & Chronologie

- **Modifications Git (±)** : visualisez en temps réel les fichiers ajoutés, modifiés ou supprimés dans le dossier de travail. Affichez les diffs en un clic, annulez un fichier ou committez avec message assisté.
- **Chronologie** : historique visuel de toutes les actions et invocations d'outils effectuées par l'agent (lecture de fichiers, commandes shell, requêtes web, etc.).
- **Worktrees Git dédiés** : lancez une session sur un worktree git isolé pour expérimenter sans toucher à votre branche principale.

---

## 8. Historique unifié (Claude Code & Antigravity)

Appuyez sur <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd> :
- Accédez à l'historique complet de vos conversations Claude Code (`~/.claude/projects`) et Antigravity (`~/.gemini/antigravity-cli/brain` & `history.jsonl`).
- Filtrez par agent avec `[ Tous ]`, `[ 🧡 Claude ]`, `[ 🔷 AGY ]`.
- Cliquez sur n'importe quelle session passée : elle est reprise immédiatement avec le bon agent !

---

## 9. Ligne de commande `sm`

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

## 10. Raccourcis clavier essentiels

| Raccourci | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> | Nouvelle session |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> | Basculer vers l'autre agent (Claude ⇄ Antigravity) |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> | Changer le modèle ou l'effort de réflexion |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Palette de commandes universelle |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd> | Historique des conversations |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd> | Panneau Git Modifications |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> | Renommer la session |
| <kbd>Ctrl</kbd>+<kbd>,</kbd> | Ouvrir les Réglages |
| <kbd>Ctrl</kbd>+<kbd>1..9</kbd> | Sélection directe d'une session |

*(Sur macOS, <kbd>Ctrl</kbd>+<kbd>Alt</kbd> s'utilise également avec <kbd>⌥</kbd>+<kbd>⌃</kbd>).*

---

## Licence

Logiciel libre sous licence [MIT](LICENSE).
Développé avec soin par [Khalil Benazouz](https://github.com/khalilbenaz).
