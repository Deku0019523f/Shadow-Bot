const { bot, db, moderation, utils } = require('../lib')
const { jidNum } = utils

// Niveaux : max messages par fenêtre, et max répétitions d'un même message
const LEVELS = {
  low: { max: 10, windowMs: 10_000, repeat: 6, description: 'Relâché (groupes actifs)' },
  medium: { max: 7, windowMs: 10_000, repeat: 4, description: 'Équilibré (recommandé)' },
  high: { max: 5, windowMs: 10_000, repeat: 3, description: 'Strict (groupes à problèmes)' },
}
const ACTIONS = {
  warn: 'averti (sans expulsion immédiate)',
  delete: 'messages supprimés seulement',
  kick: 'expulsé du groupe',
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const get = (jid) => db.get(`group:${jid}`, 'antispam', { enabled: false, level: 'medium', action: 'kick' })
const save = (jid, v) => db.set(`group:${jid}`, 'antispam', v)

bot(
  { name: 'antispam', desc: 'Protection anti-spam : on/off/low/medium/high/warn/delete/kick/info', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match) => {
    const cfg = get(m.jid)
    const cmd = (match || '').trim().split(/\s+/)
    const c = (cmd[0] || '').toLowerCase()

    if (c === 'info') {
      if (!cfg.enabled) return m.reply('📊 *Statut Antispam*\n\n🔴 Désactivé\n\nUtilisez `antispam on` pour activer la protection.')
      return m.reply(`📊 *Statut Antispam*\n\n🟢 Activé\nNiveau : ${cap(cfg.level)}\nAction : ${cap(cfg.action)}`)
    }
    if (c === 'off') {
      save(m.jid, { ...cfg, enabled: false })
      return m.reply('⚠️ *Protection antispam désactivée*\n\nLa détection du spam est maintenant OFF.')
    }
    if (c === 'on') {
      const level = (cmd[1] || 'medium').toLowerCase()
      if (!LEVELS[level]) return m.reply('❌ Niveau invalide. Utilisez : low, medium, high')
      save(m.jid, { enabled: true, level, action: 'kick' })
      return m.reply(`✅ *Protection antispam activée*\n\nNiveau : ${cap(level)} (${LEVELS[level].description})\nAction : Kick`)
    }
    if (LEVELS[c]) {
      save(m.jid, { ...cfg, level: c })
      return m.reply(`✅ *Niveau modifié*\n\nNouveau niveau : ${cap(c)}`)
    }
    if (ACTIONS[c]) {
      save(m.jid, { ...cfg, action: c })
      return m.reply(`✅ *Action modifiée*\n\nLes spammeurs seront : ${ACTIONS[c]}`)
    }
    return m.reply(
      '📖 *Aide Antispam*\n\n*Commandes :*\n• `antispam on` — activer (défaut : medium)\n• `antispam off` — désactiver\n• `antispam <low/medium/high>` — sensibilité\n• `antispam <warn/delete/kick>` — action\n• `antispam info` — réglages actuels\n\n*Niveaux :*\n• Low — relâché (groupes actifs)\n• Medium — équilibré (recommandé)\n• High — strict (groupes à problèmes)'
    )
  }
)

// Historique en mémoire : "groupe|utilisateur" -> [{ t, text }]
const history = new Map()
const flagged = new Map() // évite de sanctionner 10 fois de suite

bot({ on: 'message' }, async (m) => {
  if (!m.isGroup || m.fromMe || m.isOwner) return
  const cfg = get(m.jid)
  if (!cfg.enabled) return
  const lv = LEVELS[cfg.level] || LEVELS.medium

  const key = `${m.jid}|${m.sender}`
  const now = Date.now()
  const list = (history.get(key) || []).filter((e) => now - e.t < lv.windowMs)
  list.push({ t: now, text: m.text || m.type })
  history.set(key, list)
  if (history.size > 5000) history.delete(history.keys().next().value)

  const sameCount = list.filter((e) => e.text === list[list.length - 1].text).length
  if (list.length < lv.max && sameCount < lv.repeat) return
  if (now - (flagged.get(key) || 0) < 15_000) return m.deleteMessage().catch(() => {})

  const info = await m.groupInfo()
  if (!info.isBotAdmin || info.isAdmin) return
  flagged.set(key, now)
  history.delete(key)

  const who = `@${jidNum(m.sender)}`
  await m.deleteMessage().catch(() => {})
  if (cfg.action === 'kick') {
    await m.sock.groupParticipantsUpdate(m.jid, [m.sender], 'remove').catch(() => {})
    return m.send(`🚫 ${who} a été expulsé pour spam.`, { mentions: [m.sender] })
  }
  if (cfg.action === 'warn') {
    const r = await moderation.addWarn(m.sock, m.jid, m.sender).catch(() => null)
    if (!r) return
    return m.send(
      r.kicked
        ? moderation.template('WARN_KICK_MESSAGE', { mention: who })
        : moderation.template('WARN_MESSAGE', { mention: who, reason: 'spam', remaining: r.remaining, warn: r.limit }),
      { mentions: [m.sender] }
    )
  }
  await m.send(`⚠️ ${who} Arrêtez de spammer !`, { mentions: [m.sender] })
})
