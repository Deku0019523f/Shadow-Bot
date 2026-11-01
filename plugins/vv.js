const { bot, utils } = require('../lib')

// vv : récupère un média « vue unique » (en réponse à celui-ci) et l'envoie dans votre propre discussion.
bot(
  { name: 'vv', aliases: ['antivv', 'viewonce'], desc: 'Récupère un média vue unique (répondre au message) et l\'envoie dans votre compte', type: 'whatsapp', owner: true },
  async (m) => {
    const q = m.quoted
    if (!q || !['imageMessage', 'videoMessage', 'audioMessage'].includes(q.type)) {
      return m.reply('Répondez à un média *vue unique* (photo, vidéo ou vocal) avec *vv*.')
    }
    let buf
    try {
      buf = await m.downloadMedia()
    } catch {
      return m.reply('❌ Impossible de récupérer ce média (déjà expiré ou supprimé).')
    }
    if (!buf?.length) return m.reply('❌ Média vide ou introuvable.')

    const me = utils.norm(m.sock.user.id)
    const inner = q.content[q.type]
    const type = q.type.replace('Message', '')
    const from = q.sender ? `@${utils.jidNum(q.sender)}` : 'inconnu'
    const caption = `👁️ *Vue unique récupérée*\n• *De* : ${from}\n• *Discussion* : ${m.isGroup ? 'groupe' : 'privée'}${inner?.caption ? `\n• *Légende* : ${inner.caption}` : ''}`
    await m.sock.sendMessage(
      me,
      type === 'audio'
        ? { audio: buf, mimetype: inner?.mimetype || 'audio/ogg; codecs=opus', ptt: !!inner?.ptt }
        : { [type]: buf, caption, mentions: q.sender ? [q.sender] : [] }
    )
    if (type === 'audio') await m.sock.sendMessage(me, { text: caption, mentions: q.sender ? [q.sender] : [] })
    await m.react('✅')
  }
)
