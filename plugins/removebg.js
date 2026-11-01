const { bot, config } = require('../lib')

// Supprime l'arrière-plan d'une image via remove.bg (clé REMOVEBG_API_KEY)
bot({ name: 'rmbg', aliases: ['removebg'], desc: 'Supprime l\'arrière-plan d\'une image (répondre à une image)', type: 'images' }, async (m) => {
  const key = config.KEYS.REMOVEBG
  if (!key) return m.reply('⚠️ Clé REMOVEBG_API_KEY manquante (https://www.remove.bg/api).')
  if (m.mediaType !== 'image' || !m.quoted) return m.reply('Répondez à une image.')
  const buf = await m.downloadMedia()
  const form = new FormData()
  form.append('image_file', new Blob([buf]), 'image.jpg')
  form.append('size', 'auto')
  const res = await fetch('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': key }, body: form, signal: AbortSignal.timeout(60_000) })
  if (!res.ok) return m.reply(`❌ remove.bg : ${res.status} ${(await res.text()).slice(0, 150)}`)
  await m.sendMedia(Buffer.from(await res.arrayBuffer()), { type: 'document', mimetype: 'image/png', fileName: 'rmbg.png' })
})
