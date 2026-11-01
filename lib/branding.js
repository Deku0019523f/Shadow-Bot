const fs = require('fs')
const path = require('path')

// Logo du bot (assets/logo.jpg). Remplaçable via LOGO_PATH. Renvoie null si le fichier est absent.
const file = process.env.LOGO_PATH || path.join(__dirname, '..', 'assets', 'logo.jpg')
let cache

function logo() {
  if (cache === undefined) {
    try {
      cache = fs.readFileSync(file)
    } catch {
      cache = null
    }
  }
  return cache
}

// Envoie un texte accompagné du logo (image + légende), ou le texte seul si le logo est absent
// ou si la légende dépasse la limite de WhatsApp.
async function sendWithLogo(sock, jid, text, opts = {}) {
  const img = logo()
  if (img && text.length <= 1000) return sock.sendMessage(jid, { image: img, caption: text }, opts)
  if (img) await sock.sendMessage(jid, { image: img }, opts)
  return sock.sendMessage(jid, { text }, opts)
}

module.exports = { logo, sendWithLogo }
