const cheerio = require('cheerio')
const { bot, http } = require('../lib')

// Recherche d'images (Bing) : img <mot-clé>[,nombre] · pinterest <mot-clé> ou lien d'un pin
async function bingImages(q, n = 5) {
  const html = await http.getText(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC3&first=1&safeSearch=Moderate`, { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } })
  const $ = cheerio.load(html)
  const out = []
  $('a.iusc').each((_, el) => {
    try {
      const j = JSON.parse($(el).attr('m'))
      if (j.murl) out.push(j.murl)
    } catch {}
  })
  return out.slice(0, Math.max(n * 3, 12)) // marge : certaines URL sont mortes
}

async function sendImages(m, urls, n) {
  let sent = 0
  for (const u of urls) {
    if (sent >= n) break
    try {
      await m.sendMedia(await http.getBuffer(u, { timeout: 15_000 }), { type: 'image', quoted: false })
      sent++
    } catch {}
  }
  if (!sent) await m.reply('Aucune image accessible trouvée.')
}

bot({ name: 'img', desc: 'Recherche d\'images (img chat,3)', type: 'recherche' }, async (m, match) => {
  if (!match) return m.reply('Exemple : img coucher de soleil,5')
  const [q, c] = match.split(',').map((s) => s.trim())
  const n = Math.min(Math.max(parseInt(c) || 3, 1), 10)
  await sendImages(m, await bingImages(q, n), n)
})

bot({ name: 'pinterest', aliases: ['pin'], desc: 'Images Pinterest (pinterest mot-clé,3) ou téléchargement d\'un pin (lien)', type: 'recherche' }, async (m, match) => {
  if (!match) return m.reply('Exemple : pinterest fond écran,3\nou : pinterest https://pin.it/xxxx')
  if (/^https?:\/\//.test(match)) {
    const html = await http.getText(match, { headers: { 'accept-language': 'en' } })
    const $ = cheerio.load(html)
    const video = $('meta[property="og:video"], meta[name="twitter:player:stream"]').attr('content')
    const image = $('meta[property="og:image"]').attr('content')
    if (video) return m.sendMedia(video, { type: 'video' })
    if (image) return m.sendMedia(image.replace(/\/\d+x\//, '/originals/'), { type: 'image' })
    return m.reply('Média introuvable sur ce lien.')
  }
  const [q, c] = match.split(',').map((s) => s.trim())
  const n = Math.min(Math.max(parseInt(c) || 3, 1), 10)
  await sendImages(m, await bingImages(`${q} site:pinterest.com`, n), n)
})
