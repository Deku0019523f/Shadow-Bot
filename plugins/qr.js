const QRCode = require('qrcode')
const sharp = require('sharp')
const jsQR = require('jsqr')
const { bot } = require('../lib')

// qr <texte> → image QR · qr (en répondant à une image) → lit le QR code
bot({ name: 'qr', desc: 'Crée un QR code (qr texte) ou lit un QR code (répondre à une image)', type: 'outils' }, async (m, match) => {
  if (m.quoted && m.mediaType === 'image' && !match) {
    const { data, info } = await sharp(await m.downloadMedia()).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const res = jsQR(new Uint8ClampedArray(data), info.width, info.height)
    return m.reply(res ? res.data : 'Aucun QR code détecté.')
  }
  const text = match || m.quoted?.text
  if (!text) return m.reply('Exemple : qr https://exemple.com\nou répondez à une image contenant un QR code.')
  await m.sendMedia(await QRCode.toBuffer(text, { width: 600, margin: 2 }), { type: 'image', caption: text.length < 200 ? text : undefined })
})
