// Téléchargement + envoi d'un lien via yt-dlp (utilisé par les plugins de téléchargement)
const ytdlp = require('./ytdlp')

async function sendLink(m, url, { audio = false, caption = true } = {}) {
  await m.react('⏳')
  try {
    const { buffer, title } = await ytdlp.download(url, { audio })
    if (audio) await m.sendMedia(buffer, { type: 'audio', mimetype: 'audio/mpeg' })
    else await m.sendMedia(buffer, { type: 'video', caption: caption ? title : undefined })
    await m.react('✅')
  } catch (e) {
    await m.react('❌')
    await m.reply(`❌ ${e.message}`)
  }
}

const urlIn = (m, match) => (match.match(/https?:\/\/\S+/) || m.quoted?.text?.match(/https?:\/\/\S+/) || [])[0]

module.exports = { sendLink, urlIn }
