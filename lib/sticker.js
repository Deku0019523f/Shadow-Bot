// Création / lecture de stickers WebP (avec métadonnées pack + auteur)

const sharp = require('sharp')
const { Image } = require('node-webpmux')
const crypto = require('crypto')
const { ffmpeg } = require('./ffmpeg')

function exifBuffer(pack = '', author = '') {
  const json = {
    'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
    'sticker-pack-name': pack,
    'sticker-pack-publisher': author,
    emojis: ['😀'],
  }
  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
  const body = Buffer.from(JSON.stringify(json), 'utf8')
  header.writeUIntLE(body.length, 14, 4)
  return Buffer.concat([header, body])
}

async function withExif(webp, pack, author) {
  const img = new Image()
  await img.load(webp)
  img.exif = exifBuffer(pack, author)
  return img.save(null)
}

// Image (jpg/png/webp/gif statique) -> sticker 512x512
// mode: 'full' (contenu entier, fond transparent) | 'crop' (remplit le carré) | 'circle'
async function imageToSticker(buffer, { pack = '', author = '', mode = 'full' } = {}) {
  let img = sharp(buffer, { animated: false })
  if (mode === 'crop' || mode === 'circle') {
    img = img.resize(512, 512, { fit: 'cover' })
    if (mode === 'circle') {
      const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256"/></svg>')
      img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }])
    }
  } else {
    img = img.resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  }
  const webp = await img.webp({ quality: 80 }).toBuffer()
  return withExif(webp, pack, author)
}

// Vidéo / GIF -> sticker animé (≤ 10 s)
async function videoToSticker(buffer, { pack = '', author = '', inExt = 'mp4' } = {}) {
  const webp = await ffmpeg(
    buffer,
    ['-t', '10', '-vf', "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000,format=rgba",
     '-loop', '0', '-an', '-vsync', '0', '-c:v', 'libwebp', '-lossless', '0', '-q:v', '50', '-compression_level', '6', '-preset', 'default'],
    'webp',
    { inExt }
  )
  return withExif(webp, pack, author)
}

// Lit pack/auteur d'un sticker existant
async function readExif(webp) {
  const img = new Image()
  await img.load(webp)
  if (!img.exif) return null
  try {
    const json = img.exif.toString('utf8').match(/\{[\s\S]*\}/)?.[0]
    return json ? JSON.parse(json) : null
  } catch {
    return null
  }
}

const isAnimated = async (webp) => {
  const img = new Image()
  await img.load(webp)
  return !!img.hasAnim
}

module.exports = { imageToSticker, videoToSticker, withExif, readExif, isAnimated, exifBuffer }
