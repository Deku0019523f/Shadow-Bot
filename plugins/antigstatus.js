const { bot, db, utils } = require('../lib')
const { jidNum } = utils

// Anti statut de groupe : supprime les "statuts de groupe" publiés par les membres
const KEYS = ['groupStatusMessage', 'groupStatusMessageV2']
const get = () => db.get('global', 'antigstatus', { enabled: false, ignore: [] })
const save = (v) => db.set('global', 'antigstatus', v)
const jids = (s) => s.split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.endsWith('@g.us'))

bot(
  { name: 'antigstatus', desc: 'Anti statut de groupe : on/off, ignore/unignore <jid>, list, clear', type: 'groupe', owner: true },
  async (m, match) => {
    const cfg = get()
    const line = `*Anti statut de groupe :* \`${cfg.enabled ? 'on' : 'off'}\`\n*Groupes ignorés :* \`${cfg.ignore.length}\``
    const usage = `${line}\n\n> Utilisation :\n- antigstatus on | off — activer/désactiver\n- antigstatus ignore jid,jid,... — ignorer des groupes (sans jid : le groupe actuel)\n- antigstatus unignore jid,jid,... — retirer de la liste\n- antigstatus list — voir les ignorés\n- antigstatus clear — vider la liste`
    if (!match) return m.reply(usage)
    const cmd = match.split(/\s+/)[0].toLowerCase()
    const args = match.slice(cmd.length).trim()
    const target = () => (args ? jids(args) : m.isGroup ? [m.jid] : [])

    if (cmd === 'on' || cmd === 'off') {
      save({ ...cfg, enabled: cmd === 'on' })
      return m.reply(cmd === 'on' ? "L'anti statut de groupe a été activé." : "L'anti statut de groupe a été désactivé.")
    }
    if (cmd === 'ignore') {
      const t = target()
      if (!t.length) return m.reply('*Fournissez un JID de groupe à ignorer.* 🕵️')
      save({ ...cfg, ignore: [...new Set([...cfg.ignore, ...t])] })
      return m.reply('JID ignorés mis à jour pour l\'anti statut de groupe.')
    }
    if (cmd === 'unignore') {
      const t = target()
      if (!t.length) return m.reply('*Fournissez un JID à retirer de la liste.*')
      save({ ...cfg, ignore: cfg.ignore.filter((j) => !t.includes(j)) })
      return m.reply('JID retirés de la liste des ignorés. 🗑️')
    }
    if (cmd === 'list') {
      if (!cfg.ignore.length) return m.reply(`${line}\n\n*Aucun groupe dans la liste des ignorés.*`)
      return m.reply(`${line}\n\n*Groupes ignorés :*\n${cfg.ignore.map((j, i) => `${i + 1}. ${j}`).join('\n')}`)
    }
    if (cmd === 'clear') {
      save({ ...cfg, ignore: [] })
      return m.reply('*Liste des ignorés vidée.* 🧹')
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
  await m.send(`🚫 @${jidNum(m.sender)} : les statuts de groupe sont désactivés ici.`, { mentions: [m.sender] })
})
