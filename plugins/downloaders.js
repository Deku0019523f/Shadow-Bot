const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const yts = require('yt-search')
const { bot, http, ytdlp, dl } = require('../lib')

// Téléchargeurs (yt-dlp + ffmpeg requis). Chaque commande accepte un lien, ou le lien d'un message cité.
const social = [
  ['tiktok', ['tt'], 'TikTok (sans filigrane quand disponible)', 'https://www.tiktok.com/@…/video/…'],
  ['insta', ['ig', 'instagram'], 'Instagram (posts, reels, vidéos)', 'https://www.instagram.com/reel/…'],
  ['fb', ['facebook'], 'Facebook', 'https://www.facebook.com/…/videos/…'],
  ['twitter', ['x'], 'Twitter / X', 'https://x.com/…/status/…'],
]
for (const [name, aliases, label, example] of social) {
  bot({ name, aliases, desc: `Télécharge une vidéo ${label}`, type: 'téléchargement' }, async (m, match) => {
    const url = dl.urlIn(m, match)
    if (!url) return m.reply(`Exemple : ${name} ${example}\n(ou répondez à un message contenant le lien)`)
    await dl.sendLink(m, url)
  })
}

// --- YouTube ----------------------------------------------------------------
const isYt = (s) => /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(s)

async function resolve(m, match) {
  const q = match || m.quoted?.text
  if (!q) return null
  if (isYt(q.trim())) return { url: q.trim().split(/\s+/)[0] }
  const r = await yts(q)
  const v = r.videos?.[0]
  return v ? { url: v.url, title: v.title } : null
}

bot({ name: 'yts', desc: 'Recherche sur YouTube (yts baymax)', type: 'téléchargement' }, async (m, match) => {
  if (!match) return m.reply('Exemple : yts baymax')
  const r = await yts(match)
  const list = (r.videos || []).slice(0, 8)
  if (!list.length) return m.reply(`_Aucun résultat pour_ *${match}*`)
  await m.reply(list.map((v, i) => `*${i + 1}. ${v.title}*\n⏱️ ${v.timestamp} · 👁️ ${Number(v.views).toLocaleString('fr-FR')} · ${v.ago}\n👤 ${v.author?.name}\n${v.url}`).join('\n\n'))
})

bot({ name: 'song', aliases: ['play'], desc: 'Télécharge une chanson YouTube en MP3 (song nom ou lien)', type: 'téléchargement' }, async (m, match) => {
  const t = await resolve(m, match)
  if (t === null) return m.reply('Exemple : song heat waves\nou : song https://youtu.be/…')
  if (!t) return m.reply("Je n'ai pas trouvé cette chanson. 🎧")
  if (t.title) await m.reply(`🎵 *${t.title}*`)
  await dl.sendLink(m, t.url, { audio: true })
})

bot({ name: 'video', desc: 'Télécharge une vidéo YouTube (video nom ou lien)', type: 'téléchargement' }, async (m, match) => {
  const t = await resolve(m, match)
  if (t === null) return m.reply('Exemple : video heat waves\nou : video https://youtu.be/…')
  if (!t) return m.reply('Aucune vidéo trouvée. 📺')
  await dl.sendLink(m, t.url)
})

bot({ name: 'ytv', desc: 'Vidéo YouTube par lien (ytv lien[,qualité] ex : ytv lien,480)', type: 'téléchargement' }, async (m, match) => {
  const [link, q] = (match || m.quoted?.text || '').split(',').map((s) => s.trim())
  if (!isYt(link || '')) return m.reply('Exemple : ytv https://youtu.be/…,720')
  await m.react('⏳')
  try {
    const { buffer, title } = await ytdlp.download(link, { height: parseInt(q) || 720 })
    await m.sendMedia(buffer, { type: 'video', caption: title })
    await m.react('✅')
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
})

bot({ name: 'yta', desc: 'Audio YouTube par lien (yta lien)', type: 'téléchargement' }, async (m, match) => {
  const link = (match || m.quoted?.text || '').trim()
  if (!isYt(link)) return m.reply('Exemple : yta https://youtu.be/…')
  await dl.sendLink(m, link, { audio: true })
})

// --- Spotify : titre lu via oEmbed puis recherché sur YouTube -------------------
bot({ name: 'spotify', desc: 'Télécharge un titre Spotify (spotify lien) — via YouTube', type: 'téléchargement' }, async (m, match) => {
  const url = dl.urlIn(m, match)
  if (!url || !/spotify\.com\/track\//.test(url)) return m.reply('Exemple : spotify https://open.spotify.com/track/…\n(les playlists ne sont pas prises en charge)')
  const info = await http.getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
  const r = await yts(`${info.title} audio`)
  const v = r.videos?.[0]
  if (!v) return m.reply('Titre introuvable sur YouTube.')
  await m.reply(`🎧 *${info.title}*`)
  await dl.sendLink(m, v.url, { audio: true })
})

// --- Mediafire ----------------------------------------------------------------
bot({ name: 'mediafire', aliases: ['mf'], desc: 'Télécharge un fichier Mediafire (mediafire lien)', type: 'téléchargement' }, async (m, match) => {
  const url = dl.urlIn(m, match)
  if (!url || !/mediafire\.com/.test(url)) return m.reply('Exemple : mediafire https://www.mediafire.com/file/…')
  const $ = cheerio.load(await http.getText(url))
  const btn = $('#downloadButton')
  let link = btn.attr('href')
  if (!link || link.startsWith('javascript')) {
    const scrambled = btn.attr('data-scrambled-url')
    if (scrambled) link = Buffer.from(scrambled, 'base64').toString()
  }
  if (!link) return m.reply('Fichier introuvable, vérifiez le lien. 🔍')
  const name = $('.dl-btn-label').attr('title') || decodeURIComponent(link.split('/').pop())
  const head = await fetch(link, { method: 'HEAD', signal: AbortSignal.timeout(15_000) }).catch(() => null)
  const size = Number(head?.headers.get('content-length') || 0)
  if (size > 95 * 1024 * 1024) return m.reply(`Fichier trop lourd pour WhatsApp (${(size / 1048576).toFixed(0)} Mo).\n${link}`)
  await m.reply(`📂 *${name}*${size ? ` (${(size / 1048576).toFixed(1)} Mo)` : ''}`)
  await m.sendMedia(await http.getBuffer(link, { timeout: 300_000 }), { type: 'document', fileName: name })
})

// --- Stories Instagram (cookies requis : commande ytlogin) -----------------------
bot({ name: 'story', desc: 'Stories Instagram d\'un compte (story pseudo)', type: 'téléchargement' }, async (m, match) => {
  const user = (match || m.quoted?.text || '').replace(/^@/, '').trim().split(/\s+/)[0]
  if (!user) return m.reply('Exemple : story pseudo')
  await dl.sendLink(m, `https://www.instagram.com/stories/${user}/`, { caption: false })
})

// --- Cookies yt-dlp (YouTube/Instagram connectés) ------------------------------
const COOKIES = process.env.YTDLP_COOKIES || path.join(process.cwd(), 'data', 'cookies.txt')
bot({ name: 'ytlogin', desc: 'Cookies pour yt-dlp : répondre à un fichier cookies.txt · ytlogin status · ytlogin logout', type: 'téléchargement', owner: true }, async (m, match) => {
  const cmd = match.trim().toLowerCase()
  if (cmd === 'status') return m.reply(fs.existsSync(COOKIES) ? '*Cookies :* présents ✅' : '*Cookies :* absents. Envoyez un fichier cookies.txt (format Netscape) et répondez-lui avec : ytlogin')
  if (cmd === 'logout') {
    fs.rmSync(COOKIES, { force: true })
    return m.reply('*Cookies :* supprimés.')
  }
  if (m.mediaType !== 'document' || !m.quoted) return m.reply('Répondez à un fichier *cookies.txt* (export Netscape depuis votre navigateur) avec : ytlogin\nAutres : ytlogin status | ytlogin logout')
  const buf = await m.downloadMedia()
  if (!buf.toString('utf8', 0, 400).includes('Netscape') && !buf.toString().includes('\t')) return m.reply('Ce fichier ne ressemble pas à un cookies.txt Netscape.')
  fs.mkdirSync(path.dirname(COOKIES), { recursive: true })
  fs.writeFileSync(COOKIES, buf, { mode: 0o600 })
  await m.reply('*Cookies :* enregistrés ✅')
})
