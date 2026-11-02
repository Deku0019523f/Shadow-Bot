const { bot, db, config, utils } = require('../lib')
const { norm, toJid } = utils

// Réponse automatique quand on mentionne le compte du bot (ou un propriétaire).
//   mention <message>  définit la réponse (réponse à une image/vidéo = média joint ; ou URL média dans le texte)
//   mention on | off | get
const MAX_MEDIA = 2 * 1024 * 1024
const EXTRACT_URL = /https?:\/\/\S+\.(?:jpe?g|png|webp|gif|mp4|mov|webm)(?:\?\S*)?/i
const get = () => db.get('global', 'mention', null)

bot(
  { name: 'mention', desc: 'Réponse automatique quand on vous mentionne (mention <message> | on | off | get)', type: 'perso', owner: true },
  async (m, match) => {
    const cfg = get()
    if (!match) return m.reply(`La mention est ${cfg?.enabled ? 'on' : 'off'}.\n\nExemple : mention on | off | get | <message>\n(Répondre à une image/vidéo pour la joindre au message.)`)
    if (match === 'get') {
      if (!cfg?.message) return m.reply('Réponse à la mention non activée.')
      return m.reply(cfg.message)
    }
    if (match === 'on' || match === 'off') {
      if (!cfg?.message) return m.reply("Définissez d'abord un message : mention <message>")
      db.set('global', 'mention', { ...cfg, enabled: match === 'on' })
      return m.reply(match === 'on' ? 'Réponse à la mention activée.' : 'Réponse à la mention désactivée.')
    }
    let media = null
    if (m.quoted && ['imageMessage', 'videoMessage'].includes(m.quoted.type)) {
      const buf = await m.downloadMedia().catch(() => null)
      if (buf && buf.length <= MAX_MEDIA) media = { data: buf.toString('base64'), type: m.quoted.type === 'videoMessage' ? 'video' : 'image' }
      else if (buf) await m.reply('⚠️ Média trop lourd (2 Mo max) : seul le texte est enregistré. Utilisez une URL pour un gros fichier.')
    }
    db.set('global', 'mention', { enabled: true, message: match, media })
    await m.reply('Paramètres de mention mis à jour.')
  }
)

bot({ on: 'message' }, async (m) => {
  const cfg = get()
  if (!cfg?.enabled || m.fromMe || !m.mentioned.length) return
  const mine = [m.sock.user?.id, m.sock.user?.lid].filter(Boolean).map(norm)
  if (!m.mentioned.some((j) => mine.includes(norm(j)))) return

  if (cfg.media) return m.sendMedia(Buffer.from(cfg.media.data, 'base64'), { type: cfg.media.type, caption: cfg.message })
  const url = cfg.message.match(EXTRACT_URL)?.[0]
  if (url) {
    const caption = cfg.message.replace(url, '').trim()
    return m.sendMedia(url, { type: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image', caption })
  }
  await m.reply(cfg.message)
})
