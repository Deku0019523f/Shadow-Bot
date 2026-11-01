# API des plugins — Shadow Bot

Un plugin = un fichier `plugins/<nom>.js` (les fichiers commençant par `_` sont ignorés).
Il enregistre des commandes et/ou des écouteurs avec `bot()`. Tout est en CommonJS (`require`).

```js
const { bot, db, http } = require('../lib')

bot({ name: 'hello', aliases: ['hi'], desc: 'Dit bonjour', type: 'général' },
  async (m, match, ctx) => {
    await m.reply(`Salut ${m.pushName} ! Args : ${match || '(aucun)'}`)
  })
```

## Options d'une commande

| Option | Effet |
|---|---|
| `name` (requis) | nom sans préfixe, en minuscules |
| `aliases` | autres noms |
| `desc` | description courte en français (affichée dans `menu`) |
| `type` | catégorie du menu : `général`, `groupe`, `modération`, `média`, `téléchargement`, `recherche`, `ia`, `outils`, `jeux`, `propriétaire`, `profil` |
| `onlyGroup` / `onlyPm` | restreint aux groupes / aux discussions privées |
| `admin` | l'expéditeur doit être admin du groupe (le propriétaire passe toujours) |
| `botAdmin` | le bot doit être admin du groupe |
| `owner` | réservé au propriétaire (`OWNER` dans .env, ou le compte du bot lui-même) |
| `hidden` | n'apparaît pas dans le menu |

Le handler vérifie ces permissions et envoie le message d'erreur : **ne pas les recoder dans le plugin**.
`match` = texte après le nom de la commande (trim). `ctx.PREFIX` = préfixe actuel.

## Écouteurs passifs (sans préfixe)

```js
bot({ on: 'message' },      async (m, ctx) => {})        // chaque message reçu (y compris les siens)
bot({ on: 'participants' }, async (ev, ctx) => {})       // ev = { id: groupJid, author, action: 'add'|'remove'|'promote'|'demote', participants: [jid | {id,...}] }
bot({ on: 'status' }, async (raw, ctx) => {})             // statut WhatsApp reçu (message brut Baileys, jid status@broadcast)
bot({ on: 'update' },       async (updates, ctx) => {})  // messages.update de Baileys (édition, suppression…)
bot({ on: 'call' },         async (calls, ctx) => {})    // appels entrants ([{ id, from, status, ... }])
bot({ on: 'ready' },        async (sock, ctx) => {})     // bot (re)connecté
bot({ on: 'tick' },         async (sock, ctx) => {})     // toutes les 30 s, bot connecté : rappels, messages programmés
```
`ctx.sock` = socket Baileys dans tous les cas. Un écouteur doit **toujours** ignorer ce qui ne le concerne pas (tester `m.isGroup`, réglage activé en base, etc.) et ne jamais lever d'exception bruyante.
Pour la suppression de messages : un message supprimé arrive aussi dans `on: 'message'` avec `m.type === 'protocolMessage'` ; `store.get(jid, id)` retrouve le message d'origine (derniers ~3000 messages en mémoire).

## L'objet `m` (Message)

Champs : `m.jid` (chat), `m.isGroup`, `m.fromMe`, `m.id`, `m.key`, `m.raw` (message Baileys brut), `m.pushName`, `m.text` (texte ou légende), `m.type` (`conversation`, `imageMessage`, `videoMessage`, `audioMessage`, `stickerMessage`, `documentMessage`, `extendedTextMessage`, `protocolMessage`…), `m.content`, `m.sender` (JID de l'auteur — LID ou numéro selon le groupe), `m.senderIds` (toutes ses formes), `m.isOwner`, `m.mentioned` (JID mentionnés), `m.sock`.
`m.quoted` (ou `null`) : `{ key, message, content, type, text, sender }` = message auquel on répond.
`m.mediaType` : `'image' | 'video' | 'audio' | 'sticker' | 'document' | null` (du message cité, sinon du message courant).

Méthodes (toutes asynchrones) :
- `m.reply(text, extra?)` répond en citant · `m.send(text, extra?)` envoie sans citer (`extra` = `{ mentions: [jid] }`…)
- `m.react('✅')` · `m.deleteMessage(key?)`
- `m.sendMedia(bufferOuUrl, { type, caption, mimetype, fileName, ptt, gif, mentions, quoted })` — type : `image|video|audio|sticker|document` (déduit si Buffer)
- `m.sendSticker(webpBuffer)` · `m.sendContent(contenuBaileys, options)` pour tout le reste (sondages, listes…)
- `m.downloadMedia()` → Buffer du média cité, sinon du message courant
- `m.target(match)` → JID visé : @mention, sinon message cité, sinon numéro dans `match`, sinon `null`
- `m.groupInfo()` → `{ meta, isAdmin, isBotAdmin }` (`meta` = métadonnées Baileys : `subject`, `desc`, `participants[]`…) ; `ctx.group` est déjà rempli dans un groupe

Mentionner quelqu'un : texte `@numéro` + `{ mentions: [jid] }`.

## Bibliothèques fournies par `require('../lib')`

- `db` — réglages persistants, **API synchrone** (mémoire + écriture en base en arrière-plan) :
  `db.get(scope, key, défaut)`, `db.set(scope, key, valeurJSON)`, `db.del`, `db.keys(scope, préfixe)`, `db.all(scope)`, `db.delPrefix`, `db.scopes(préfixe)`.
  Convention de scope : `'global'`, `'group:<jid>'`, `'user:<jid>'`, `'plugin:<nom>'`. Les valeurs sont du JSON ; pour une collection (rappels, tâches…) stocker un tableau/objet sous une clé et le réécrire en entier.
- `config` — `config.PREFIX`, `config.OWNER`, `config.BOT_NAME`, `config.KEYS.GROQ|GEMINI|OPENAI|OPENROUTER|OPENWEATHER|NEWS|OMDB|REMOVEBG|GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET`.
- `http` — `getJson(url, opts)`, `getText`, `getBuffer`, `postJson(url, body, opts)`, `request`, `isUrl`, `findUrls` (timeout 30 s par défaut).
- `ffmpeg` — `ffmpeg(buffer, args, outExt, { inExt })`, `toMp3`, `toOpus` (note vocale), `toMp4`.
- `ytdlp` — `download(url, { audio, height })` → `{ buffer, title, ext }`, `getInfo(url)`, `exec(args)`.
- `sticker` — `imageToSticker(buf, { pack, author, mode: 'full'|'crop'|'circle' })`, `videoToSticker(buf, { pack, author, inExt })`, `withExif`, `readExif`, `isAnimated`.
- `groups` — `getMeta(sock, jid)`, `adminLevel(meta, ids)`. `moderation` — `addWarn(sock, groupJid, user)`, `getWarns`, `resetWarns`, `getWarnLimit`.
- `utils` — `norm`, `digits`, `toJid`, `sleep`, `formatUptime`, `ramUsage`.
- `store` — `store.get(jid, id)` message brut récent. `state` — état de connexion. `getSock()` — socket Baileys courant (pour les tâches hors message).
- Dépendances npm déjà installées : `@whiskeysockets/baileys`, `sharp`, `node-webpmux`, `file-type` (v16, `require('file-type').fromBuffer`), `qrcode`, `jsqr`, `pdfkit`, `cheerio`, `google-tts-api`, `google-translate-api-x`, `yt-search`, `pg`, `better-sqlite3`, `express`. Binaires : `ffmpeg`, `yt-dlp`.

## Règles d'écriture

1. Messages destinés aux utilisateurs **en français**.
2. **Aucune clé API ni secret dans le code.** Clés via `config.KEYS.*` (variables d'environnement) ; si une clé manque, répondre clairement laquelle définir.
3. Valider les entrées (`match` vide → message d'usage avec un exemple), gérer les erreurs réseau avec un message lisible, ne jamais planter.
4. Un plugin ne modifie pas `lib/`, ni les fichiers d'un autre plugin, ni `package.json`.
5. Nom de commande unique dans tout le bot (`node scripts/check.js` détecte les doublons).
6. Pas de `console.log` de debug ; utiliser `logger` de `../lib` si besoin.
7. Taille des médias : WhatsApp refuse les très gros fichiers — envoyer en `document` au-delà d'environ 50 Mo ou refuser proprement.
