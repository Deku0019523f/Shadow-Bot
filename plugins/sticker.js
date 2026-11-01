const { bot, db, sticker, ffmpeg: ff } = require('../lib')

// Stickers : sticker · circle · take · mp4 · exif (pack/auteur par défaut)
const meta = () => db.get('global', 'sticker_meta', { pack: 'Shadow Bot', author: '' })
const MAX_VIDEO = 25 * 1024 * 1024

async function make(m, mode) {
  const type = m.mediaType
  if (!['image', 'video', 'sticker'].includes(type)) return m.reply('Répondez à une image, une vidéo/GIF ou un sticker.')
  const buf = await m.downloadMedia()
  if (!buf) return m.reply('Impossible de télécharger le média.')
  const { pack, author } = meta()
  if (type === 'video') {
    if (buf.length > MAX_VIDEO) return m.reply('Vidéo trop lourde (25 Mo max).')
    return m.sendSticker(await sticker.videoToSticker(buf, { pack, author }))
  }
  if (type === 'sticker' && (await sticker.isAnimated(buf))) return m.sendSticker(await sticker.withExif(buf, pack, author))
  await m.sendSticker(await sticker.imageToSticker(buf, { pack, author, mode }))
}

bot({ name: 'sticker', aliases: ['s'], desc: 'Image/vidéo/GIF → sticker (répondre au média)', type: 'sticker' }, (m) => make(m, 'full'))
bot({ name: 'scrop', desc: 'Image → sticker recadré (carré)', type: 'sticker' }, (m) => make(m, 'crop'))
bot({ name: 'circle', desc: 'Image → sticker rond', type: 'sticker' }, (m) => make(m, 'circle'))

bot(
  { name: 'take', desc: 'Change pack et auteur d\'un sticker (take pack;auteur)', type: 'sticker' },
  async (m, match) => {
    if (m.mediaType !== 'sticker') return m.reply('Répondez à un sticker. Exemple : take Mon pack;Moi')
    const [p, a] = match.split(/[;|]/).map((s) => s.trim())
    const buf = await m.downloadMedia()
    const cur = meta()
    await m.sendSticker(await sticker.withExif(buf, p || cur.pack, a ?? m.pushName ?? cur.author))
  }
)

bot(
  { name: 'exif', desc: 'Pack/auteur par défaut des stickers (exif pack;auteur)', type: 'sticker', owner: true },
  async (m, match) => {
    if (!match) return m.reply(`Actuel : ${meta().pack};${meta().author}\nExemple : exif Shadow Bot;Moi`)
    const [pack, author = ''] = match.split(/[;|]/).map((s) => s.trim())
    db.set('global', 'sticker_meta', { pack, author })
    await m.reply('Pack/auteur des stickers mis à jour.')
  }
)

bot(
  { name: 'mp4', aliases: ['togif', 'tovideo'], desc: 'Sticker animé → vidéo MP4', type: 'sticker' },
  async (m) => {
    if (m.mediaType !== 'sticker') return m.reply('Répondez à un sticker.')
    const buf = await m.downloadMedia()
    if (!(await sticker.isAnimated(buf))) {
      const png = await require('sharp')(buf).png().toBuffer()
      return m.sendMedia(png, { type: 'image' })
    }
    const out = await ff.ffmpeg(buf, ['-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'], 'mp4', { inExt: 'webp' })
    await m.sendMedia(out, { type: 'video', gif: true })
  }
)
