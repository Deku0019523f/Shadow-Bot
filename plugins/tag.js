const { bot, utils } = require('../lib')
const { jidNum } = utils

const pad = (i, n) => String(i).padStart(String(n).length, ' ')

bot(
  { name: 'tag', desc: 'Mentionne des membres : tag all | admin | notadmin | <texte> (ou en réponse à un message)', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match, ctx) => {
    const ps = ctx.group.meta.participants
    const all = ps.map((p) => p.id)
    const sub = match.toLowerCase()

    if (sub === 'all') {
      const lines = all.map((id, i) => `${pad(i + 1, all.length)} @${jidNum(id)}`).join('\n')
      return m.send('```' + lines + '```', { mentions: all })
    }
    if (sub === 'admin' || sub === 'admins') {
      const ids = ps.filter((p) => p.admin).map((p) => p.id)
      return m.send(ids.map((id) => `@${jidNum(id)}`).join('\n') || 'Aucun admin.', { mentions: ids })
    }
    if (sub === 'notadmin' || sub === 'not admins') {
      const ids = ps.filter((p) => !p.admin).map((p) => p.id)
      return m.send(ids.map((id) => `@${jidNum(id)}`).join('\n') || 'Aucun membre.', { mentions: ids })
    }
    if (match) return m.send(match, { mentions: all })

    if (!m.quoted) return m.reply('Exemple : tag all | tag admin | tag notadmin | tag <message personnalisé> (ou répondre à un message avec « tag »)')
    if (m.quoted.text && !['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(m.quoted.type)) {
      return m.send(m.quoted.text, { mentions: all })
    }
    // Média cité : on le renvoie avec les mentions
    const buf = await m.downloadMedia()
    const type = m.quoted.type.replace('Message', '')
    await m.sendMedia(buf, { type, caption: m.quoted.text || undefined, mentions: all, quoted: false })
  }
)
