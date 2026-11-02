<p align="center"><img src="assets/logo.jpg" alt="Shadow Bot" width="720"></p>

# Shadow Bot

Bot WhatsApp modulaire en Node.js (Baileys) : système de plugins, modération de groupe, médias, IA, stockage SQLite ou PostgreSQL. **Multi-utilisateurs** : la page web est publique, chaque visiteur relie son propre compte WhatsApp (QR code ou code de jumelage) et obtient son propre bot, avec ses réglages et ses clés, séparés de ceux des autres.

## Démarrage rapide

```bash
npm install
cp .env.example .env     # puis éditer OWNER, WEB_PASSWORD, MAX_SESSIONS
npm start
```

Ouvrez `http://localhost:3000` : « Relier mon compte WhatsApp », puis
- **QR code** : WhatsApp → Appareils connectés → Connecter un appareil → scanner.
- **Code de jumelage** : saisissez votre numéro, puis entrez le code dans WhatsApp → Connecter avec le numéro de téléphone.

Chaque utilisateur est propriétaire de **son** bot (le compte relié). Vous, l'hébergeur, définissez `OWNER` (votre numéro) pour garder les commandes serveur (`restart`, `update`, `plugin`…) et `WEB_PASSWORD` pour la section « Administration » de la page (liste et suppression des comptes). `MAX_SESSIONS` limite le nombre de comptes (chacun consomme de la mémoire). Sur Render, une base PostgreSQL (`DATABASE_URL`) est indispensable pour conserver les sessions.

Tapez `.menu` dans WhatsApp pour voir les commandes. Écrire un plugin : voir [docs/plugin-api.md](docs/plugin-api.md). Plan du projet : [plan.md](plan.md).

## Commandes

189 commandes (modération, groupes, filtres, jeux, stickers, audio/vidéo, téléchargeurs, IA, outils, organisation, administration) : liste complète dans [docs/commands.md](docs/commands.md). Tapez `.menu` pour la voir dans WhatsApp, `.list` pour une liste compacte.

Certaines commandes demandent des clés ou des binaires :

| Commandes | Prérequis |
|---|---|
| `song` `video` `tiktok` `insta` `fb` `twitter` `reddit` `spotify` `story` `ytv` `yta` | `yt-dlp` + `ffmpeg` (inclus dans le Dockerfile). `ytlogin` : cookies pour les contenus restreints |
| `mp3` `rotate` `trim` `merge` `bass` `histo`… | `ffmpeg` |
| `gpt` `dall` `gemini` `groq` `or` `bing` `lydia` | une clé : `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` |
| `skull` `sketch` `cartoon`… (effets photo) | `GEMINI_API_KEY` |
| `rmbg` | `REMOVEBG_API_KEY` |
| `movie` | `OMDB_API_KEY` |
| `reminder` `task` `backup` `gupload` (Google) | `GOOGLE_CLIENT_ID/SECRET`, puis `.gauth` |

Aucune clé n'est exigée sur le serveur : chaque utilisateur pose les siennes depuis WhatsApp, `.setvar GEMINI_API_KEY = …` (le message est supprimé, la valeur est masquée dans `.allvar`). Elles ne servent qu'à son bot.

Différences avec Levanter : pas d'API privée — les téléchargements passent par yt-dlp, `bing` utilise Gemini + recherche web, `gstatus` (statut de groupe) est expérimental, `restart`/`update` supposent un superviseur (PM2, Docker, Render) ou un dépôt git.

## Déploiement

| Plateforme | Possible ? | Remarque |
|---|---|---|
| VPS / PC / Docker | ✅ | Recommandé. Garder le dossier `data/` (volume). |
| Render, Railway, Koyeb, Fly… | ✅ | Disque éphémère → définir `DATABASE_URL` (PostgreSQL) pour conserver la session. Sur Render gratuit, le service s'endort : pingez `/health`. |
| Vercel / Netlify (serverless) | ❌ | Le bot doit garder une connexion WebSocket permanente avec WhatsApp, impossible en serverless. |

```bash
docker build -t shadow-bot . && docker run -d --name shadow-bot -p 3000:3000 -v shadow-data:/app/data --env-file .env shadow-bot
# ou, sans Docker :
pm2 start ecosystem.config.js && pm2 save
```

Render : `render.yaml` (Blueprint) crée le service Docker et la base PostgreSQL ; renseignez `OWNER` et `WEB_PASSWORD`.

⚠️ Baileys n'est pas une API officielle : utilisez de préférence un numéro dédié et évitez tout envoi massif.
