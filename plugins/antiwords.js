const { bot, db, moderation, utils } = require('../lib')
const { jidNum } = utils

const get = (jid) => db.get(`group:${jid}`, 'antiword', { enabled: false, action: 'null', words: [] })
const save = (jid, v) => db.set(`group:${jid}`, 'antiword', v)
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const list = (s) => s.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)

bot(
  { name: 'antiword', desc: 'Filtre de mots interdits : on/off, kick|warn|null, add/remove/list/clear', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match) => {
    const cfg = get(m.jid)
    const status = cfg.enabled ? 'on' : 'off'
    const example = `Statut AntiWord : *${status}*\n> *Exemples d'utilisation :*\n- antiword kick | warn | null — action en cas d'infraction\n- antiword on | off — activer/désactiver\n- antiword add mot1,mot2 — ajouter des mots\n- antiword remove mot1,mot2 — retirer des mots\n- antiword list — voir les mots bloqués\n- antiword clear — vider la liste`
    if (!match) return m.reply(example)
    const cmd = match.split(/\s+/)[0].toLowerCase()
    const args = match.slice(cmd.length).trim()

    if (cmd === 'on' || cmd === 'off') {
      save(m.jid, { ...cfg, enabled: cmd === 'on' })
      return m.reply(`AntiWord est maintenant *${cmd === 'on' ? 'activé' : 'désactivé'}*.`)
    }
    if (['kick', 'warn', 'null'].includes(cmd)) {
      save(m.jid, { ...cfg, action: cmd })
      return m.reply(`Action AntiWord mise à jour à : *${cmd}*`)
    }
    if (cmd === 'add') {
      if (!args) return m.reply('*Donnez les mots à ajouter.*')
      const add = list(args)
      save(m.jid, { ...cfg, words: [...new Set([...cfg.words, ...add])] })
      return m.reply(`*Mots ajoutés :*\n${add.join(', ')}`)
    }
    if (cmd === 'remove') {
      if (!args) return m.reply('*Donnez les mots à supprimer.*')
      const rm = list(args)
      save(m.jid, { ...cfg, words: cfg.words.filter((w) => !rm.includes(w)) })
      return m.reply(`*Mots supprimés :*\n${rm.join(', ')}`)
    }
    if (cmd === 'list' || cmd === 'info') {
      if (!cfg.words.length) return m.reply('*Aucun mot défini.*')
      return m.reply(`*Statut AntiWord :* ${status}\n*Action :* ${cfg.action}\n\n*Mots :* ${cfg.words.join(', ')}`)
    }
    if (cmd === 'clear') {
      save(m.jid, { ...cfg, words: [] })
      return m.reply('*Liste AntiWord effacée.*')
    }
    return m.reply(example)
  }
)

bot({ on: 'message' }, async (m) => {
  if (!m.isGroup || m.fromMe || !m.text) return
  const cfg = get(m.jid)
  if (!cfg.enabled || !cfg.words.length) return
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${cfg.words.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'iu')
  if (!re.test(m.text)) return

  const info = await m.groupInfo()
  if (!info.isBotAdmin || info.isAdmin || m.isOwner) return
  await m.deleteMessage().catch(() => {})
  const who = `@${jidNum(m.sender)}`
  if (cfg.action === 'kick') {
    await m.sock.groupParticipantsUpdate(m.jid, [m.sender], 'remove').catch(() => {})
    return m.send(`🚫 ${who} a été expulsé (mot interdit).`, { mentions: [m.sender] })
  }
  if (cfg.action === 'warn') {
    const r = await moderation.addWarn(m.sock, m.jid, m.sender).catch(() => null)
    if (!r) return
    return m.send(
      r.kicked
        ? moderation.template('WARN_KICK_MESSAGE', { mention: who })
        : moderation.template('WARN_MESSAGE', { mention: who, reason: 'mot interdit', remaining: r.remaining, warn: r.limit }),
      { mentions: [m.sender] }
    )
  }
})
