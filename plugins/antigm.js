const { bot, db, moderation, utils } = require('../lib')
const { jidNum } = utils

// Anti-mention de groupe : messages qui "mentionnent" le groupe (ex. statuts qui taguent un groupe)
const KEYS = ['groupMentionedMessage', 'groupStatusMentionMessage']
const get = () => db.get('global', 'antigm', { enabled: false, action: 'delete', ignore: [] })
const save = (v) => db.set('global', 'antigm', v)
const jids = (s) => s.split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.endsWith('@g.us'))

bot(
  { name: 'antigm', desc: 'Anti mention de groupe : on/off, delete|warn|kick, ignore <jid>', type: 'groupe', owner: true },
  async (m, match) => {
    const usage = "> Utilisation :\n- antigm on | off — activer/désactiver l'anti mention de groupe\n- antigm delete | warn | kick — action quand quelqu'un mentionne le groupe\n- antigm ignore jid,jid,... — ignorer des groupes précis"
    if (!match) return m.reply(usage)
    const cfg = get()
    const cmd = match.split(/\s+/)[0].toLowerCase()
    const args = match.slice(cmd.length).trim()
    if (['delete', 'warn', 'kick'].includes(cmd)) {
      save({ ...cfg, action: cmd })
      return m.reply(`Action mise à jour : les mentions de groupe entraîneront désormais *${cmd}*.`)
    }
    if (cmd === 'on' || cmd === 'off') {
      save({ ...cfg, enabled: cmd === 'on' })
      return m.reply(cmd === 'on' ? "L'anti mention de groupe a été activé." : "L'anti mention de groupe a été désactivé.")
    }
    if (cmd === 'ignore') {
      const list = jids(args)
      if (!list.length) return m.reply('*Fournissez au moins un JID de groupe à ignorer* (se termine par @g.us).')
      save({ ...cfg, ignore: [...new Set(list)] })
      return m.reply('JID ignorés mis à jour pour l\'anti mention de groupe.')
    }
    return m.reply(usage)
  }
)

bot({ on: 'message' }, async (m) => {
  if (!m.isGroup || m.fromMe || m.isOwner) return
  const cfg = get()
  if (!cfg.enabled || cfg.ignore.includes(m.jid)) return
  const msg = m.raw.message || {}
  if (!(KEYS.includes(m.type) || KEYS.some((k) => msg[k]))) return

  const info = await m.groupInfo()
  if (!info.isBotAdmin || info.isAdmin) return
  await m.deleteMessage().catch(() => {})
  const who = `@${jidNum(m.sender)}`
  if (cfg.action === 'kick') {
    await m.sock.groupParticipantsUpdate(m.jid, [m.sender], 'remove').catch(() => {})
    return m.send(`🚫 ${who} a été expulsé (mention de groupe).`, { mentions: [m.sender] })
  }
  if (cfg.action === 'warn') {
    const r = await moderation.addWarn(m.sock, m.jid, m.sender).catch(() => null)
    if (!r) return
    return m.send(
      r.kicked
        ? moderation.template('WARN_KICK_MESSAGE', { mention: who })
        : moderation.template('WARN_MESSAGE', { mention: who, reason: 'mention de groupe', remaining: r.remaining, warn: r.limit }),
      { mentions: [m.sender] }
    )
  }
})
