const { bot, moderation, utils, groups } = require('../lib')
const { jidNum, norm } = utils

const at = (jid) => `@${jidNum(jid)}`

bot(
  { name: 'warn', desc: 'Avertit un membre (warn @user raison) — "warn reset @user" remet à zéro', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match, ctx) => {
    const usage = "Exemple : warn @utilisateur raison — OU warn reset @utilisateur.\nVous pouvez aussi répondre au message d'un membre et taper 'warn' ou 'warn reset'."
    if (!match && !m.quoted) return m.reply(usage)

    const [first, second] = match.split(/\s+/)
    const limit = moderation.getWarnLimit(m.jid)

    if (first && first.toLowerCase() === 'reset') {
      const user = m.mentioned[0] || m.quoted?.sender || (second && second.replace(/\D/g, '').length >= 7 ? `${second.replace(/\D/g, '')}@s.whatsapp.net` : null)
      if (!user) return m.reply("Exemple : warn reset @utilisateur (ou répondre au message d'un membre et taper 'warn reset').")
      moderation.resetWarns(m.jid, user)
      return m.send(moderation.template('WARN_RESET_MESSAGE', { mention: at(user), remaining: limit, warn: limit }), { mentions: [user] })
    }

    const user = m.mentioned[0] || m.quoted?.sender
    if (!user) return m.reply(usage)
    const meta = ctx.group.meta
    if (groups.adminLevel(meta, [norm(user)])) return m.reply('Je ne peux pas avertir un administrateur.')

    const reason = match.replace(/@\d+/g, '').trim() || 'aucune raison précisée'

    // Au-delà de la limite : expulsion (le bot doit être admin)
    if (moderation.getWarns(m.jid, user) + 1 > limit && !ctx.group.isBotAdmin) {
      return m.reply('⚠️ Je dois être admin du groupe pour expulser ce membre.')
    }
    const r = await moderation.addWarn(m.sock, m.jid, user)
    if (r.kicked) return m.send(moderation.template('WARN_KICK_MESSAGE', { mention: at(user) }), { mentions: [user] })

    await m.send(
      moderation.template('WARN_MESSAGE', { mention: at(user), reason, remaining: r.remaining, warn: r.limit }),
      { mentions: [user] }
    )
    if (m.quoted) await m.deleteMessage(m.quoted.key).catch(() => {})
  }
)

bot(
  { name: 'warns', desc: "Affiche les avertissements d'un membre", type: 'groupe', onlyGroup: true },
  async (m) => {
    const user = m.mentioned[0] || m.quoted?.sender || m.sender
    const limit = moderation.getWarnLimit(m.jid)
    await m.send(`⚠️ ${at(user)} : ${moderation.getWarns(m.jid, user)}/${limit} avertissement(s).`, { mentions: [user] })
  }
)
