# Plan du projet — Shadow Bot (bot WhatsApp inspiré de Levanter)

## 1. Objectif

Créer un bot WhatsApp modulaire en Node.js, avec un système de plugins, de la modération de groupe, une base SQLite et une API HTTP optionnelle (envoi de messages + webhook des messages entrants).

## 2. Analyse de Levanter (la source d'inspiration)

- Le cœur (`lib/`) est **obfusqué** et dépend d'un fork privé de Baileys (Bitbucket). Il n'est ni lisible ni réutilisable proprement.
- Les `plugins/` sont lisibles et montrent le bon modèle : `bot({ pattern, desc, type, onlyGroup }, async (message, match, ctx) => {})`.
- Fonctionnalités repérées : plugins par catégorie, menu, anti-link / anti-word / warn, welcome/goodbye, stickers, téléchargeurs, multi-session, mode API avec webhook, 12 langues.
- Décision : **ne rien copier du code obfusqué**. On reprend uniquement les idées (plugins, catégories, API mode) et on réécrit un noyau propre sur le Baileys **public** (`@whiskeysockets/baileys`).
- Point d'attention : le plugin météo de Levanter contient une clé API codée en dur — à ne pas reproduire (toutes les clés vont dans `.env`).

## 3. Stack technique

| Élément | Choix |
|---|---|
| Runtime | Node.js ≥ 20 |
| WhatsApp | `@whiskeysockets/baileys` (v7 rc, gestion des LID) |
| Base de données | SQLite via `better-sqlite3` (table clé/valeur JSON par scope) |
| API HTTP | Express (optionnelle, protégée par `x-api-key`) |
| Images / stickers | `sharp` |
| Logs | `pino` |
| Config | `dotenv` (`.env`) |

## 4. Architecture

```
shadow-bot/
├── index.js              # démarrage : plugins → connexion → API → arrêt propre
├── config.js             # lecture du .env
├── plan.md
├── lib/
│   ├── registry.js       # bot() : enregistre commandes et écouteurs passifs
│   ├── loader.js         # charge plugins/*.js (un plugin cassé n'arrête pas le bot)
│   ├── connection.js     # socket Baileys, code de jumelage / QR, reconnexion
│   ├── handler.js        # préfixe, permissions, exécution, gestion d'erreurs
│   ├── message.js        # classe Message (reply, react, target, downloadMedia, groupInfo)
│   ├── groups.js         # cache des métadonnées de groupe, détection admin (LID/numéro)
│   ├── moderation.js     # avertissements (addWarn, limite, expulsion)
│   ├── db.js             # SQLite clé/valeur
│   ├── events.js         # bus interne (alimente le webhook)
│   ├── api.js            # API Express optionnelle
│   ├── logger.js / utils.js / index.js
├── plugins/              # 1 fichier = 1 thème, 189 commandes (liste : docs/commands.md)
│   ├── general, group, tag, poll, gpp, greet, greetings, tog      # base et groupes
│   ├── antilink, antiwords, antifake, spam, antigm, antigstatus, antiedit, mute, pdm, warn   # modération
│   ├── filters, gfilters, msgs, mention, vote, tictactoe, wcg      # réponses auto, compteurs, jeux
│   ├── sticker, media, profile, removebg, editor                   # médias
│   ├── downloaders, search, web, tools, qr, fancy                  # téléchargement et outils
│   ├── ai, logia                                                   # IA, commandes autorisées (zushi/yami/ope)
│   ├── system, automation, admin, gauth                            # compte, automatisations, administration
│   └── reminder, scheduleMessage, task, budget, backup             # organisation
├── scripts/check.js      # vérifie le chargement de tous les plugins ; scripts/docs.js génère docs/commands.md
├── data/                 # session WhatsApp + base SQLite (non versionné)
├── Dockerfile, render.yaml, ecosystem.config.js, .env.example, README.md
```

## 5. API interne d'un plugin

```js
const { bot } = require('../lib')

// Commande
bot({ name: 'ping', aliases: [], desc: '...', type: 'général',
      onlyGroup, onlyPm, owner, admin, botAdmin },
    async (m, match, ctx) => { await m.reply('pong') })

// Écouteur passif (sans préfixe)
bot({ on: 'message' }, async (m, ctx) => {})
bot({ on: 'participants' }, async (event, ctx) => {})
```

Les permissions (`owner`, `admin`, `botAdmin`, `onlyGroup`, `onlyPm`) sont vérifiées par le handler : un plugin n'a jamais à les recoder.

## 6. Fonctionnalités

**Déjà écrit**
- Noyau complet : connexion (code de jumelage ou QR), reconnexion automatique, cache de groupes, détection admin compatible LID, mode public/privé, API + webhook.
- `ping`, `alive`, `menu` (alias `help`, `aide`).
- Groupe : `kick`, `promote`, `demote`, `tagall`, `hidetag`, `link`, `open`, `close`.

**Reste à écrire (phase 1)**
- `antilink` (on/off, action delete/warn/kick, liens WhatsApp ou tous les liens).
- `warn`, `warns`, `resetwarn`, `warnlimit` (expulsion à la limite, 3 par défaut).
- `welcome` / `goodbye` avec variables `{user}`, `{group}`, `{count}`.
- `sticker` (image → webp 512×512 avec `sharp`).
- `mode public|private` (propriétaire).

**Phase 2 — terminée** : toutes les commandes de `/plugins` de Levanter sont portées (téléchargeurs via yt-dlp, IA via les API officielles, Google via OAuth).

## 7. Livraison

Dépôt git `shadow-bot` (branche `main`), avec `npm run check` pour vérifier le chargement des plugins.

## 8. Déploiement

- **VPS (recommandé)** : `pm2 start ecosystem.config.js` ; le dossier `data/` persiste.
- **Docker** : `Dockerfile` (ffmpeg + yt-dlp inclus), monter `data/` en volume.
- **Render** : `render.yaml` (service Docker + PostgreSQL) ; la session WhatsApp est stockée dans PostgreSQL.
- **Vercel / serverless** : impossible (connexion WebSocket permanente).
- Première connexion : page web (QR ou code de jumelage), ou `PAIRING_NUMBER` dans `.env`.

## 9. Points de vigilance

- Baileys n'est pas une API officielle : un usage abusif (spam, envois massifs) peut faire bannir le numéro. Utiliser de préférence un numéro dédié.
- Ne jamais committer `.env` ni `data/` (session = accès complet au compte WhatsApp).
- L'API HTTP reste désactivée tant que `API_KEY` est vide.
