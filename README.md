<p align="center"><img src="assets/logo.jpg" alt="Shadow Bot" width="720"></p>

# Shadow Bot

Bot WhatsApp modulaire en Node.js (Baileys) : système de plugins, modération de groupe, médias, IA, page web de connexion (QR code ou code de jumelage), stockage SQLite ou PostgreSQL.

## Démarrage rapide

```bash
npm install
cp .env.example .env     # puis éditer OWNER et WEB_PASSWORD
npm start
```

Ouvrez `http://localhost:3000`, entrez le mot de passe, puis liez WhatsApp :
- **QR code** : WhatsApp → Appareils connectés → Connecter un appareil → scanner.
- **Code de jumelage** : saisissez votre numéro, puis entrez le code dans WhatsApp → Connecter avec le numéro de téléphone.

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

Les clés peuvent aussi être posées depuis WhatsApp : `.setvar GEMINI_API_KEY = …` (le message est supprimé, la valeur est masquée dans `.allvar`).

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
