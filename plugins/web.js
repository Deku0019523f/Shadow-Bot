const { bot, http, dl } = require('../lib')


// Captures d'écran, hébergement de fichiers, liens
const normUrl = (s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`)

bot({ name: 'ss', desc: 'Capture d\'écran d\'un site (ss exemple.com)', type: 'outils' }, async (m, match) => {
  const url = dl.urlIn(m, match) || (match && normUrl(match))
  if (!url) return m.reply('Exemple : ss https://exemple.com')
  await m.sendMedia(await http.getBuffer(`https://image.thum.io/get/width/1280/crop/800/noanimate/${url}`, { timeout: 60_000 }), { type: 'image', caption: url })
})

bot({ name: 'fullss', desc: 'Capture d\'écran de la page entière', type: 'outils' }, async (m, match) => {
  const url = dl.urlIn(m, match) || (match && normUrl(match))
  if (!url) return m.reply('Exemple : fullss https://exemple.com')
  await m.sendMedia(await http.getBuffer(`https://image.thum.io/get/fullpage/width/1280/noanimate/${url}`, { timeout: 60_000 }), { type: 'image', caption: url })
})

// url : héberge le média cité (catbox.moe) et renvoie le lien
bot({ name: 'url', aliases: ['tourl'], desc: 'Héberge un média et donne son lien (répondre à un média)', type: 'outils' }, async (m) => {
  if (!m.quoted || !m.mediaType) return m.reply('Répondez à une image, vidéo, audio ou document.')
  const buf = await m.downloadMedia()
  if (buf.length > 100 * 1024 * 1024) return m.reply('Fichier trop lourd (100 Mo max).')
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', new Blob([buf]), `shadow-${Date.now()}.${{ image: 'jpg', video: 'mp4', audio: 'mp3', sticker: 'webp' }[m.mediaType] || 'bin'}`)
  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form, signal: AbortSignal.timeout(120_000) })
  const text = (await res.text()).trim()
  if (!res.ok || !/^https?:\/\//.test(text)) return m.reply(`❌ Envoi impossible : ${text.slice(0, 120)}`)
  await m.reply(text)
})

// upload : récupère un média depuis un lien direct et l'envoie
bot({ name: 'upload', desc: 'Envoie le média d\'un lien direct (upload https://…/fichier.mp4)', type: 'outils' }, async (m, match) => {
  const url = dl.urlIn(m, match)
  if (!url) return m.reply('Exemple : upload https://exemple.com/video.mp4')
  const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) }).catch(() => null)
  const mime = head?.headers.get('content-type') || ''
  const type = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document'
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'fichier')
  await m.sendMedia(await http.getBuffer(url, { timeout: 120_000 }), { type, fileName: name, mimetype: mime || undefined })
})
