const { bot, db, utils } = require('../lib')
const { jidNum } = utils

// Filtre les nouveaux membres selon l'indicatif pays de leur numéro.
//   mode 'deny'  : les indicatifs listés sont refusés (liste noire)
//   mode 'allow' : seuls les indicatifs listés sont acceptés (liste blanche)
const get = (jid) => db.get(`group:${jid}`, 'antifake', { enabled: false, mode: null, codes: [] })
const save = (jid, v) => db.set(`group:${jid}`, 'antifake', v)
const codes = (s) => s.split(',').map((c) => c.trim().replace(/\D/g, '')).filter(Boolean)

bot(
  { name: 'antifake', desc: 'Filtre les numéros par indicatif pays : on/off, allow/disallow/remove/list/clear', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m, match) => {
    const cfg = get(m.jid)
    const status = cfg.enabled ? 'on' : 'off'
    const example = `*Statut Antifake :* ${status}\n\n> *Exemples d'utilisation :*\n- antifake list — voir les indicatifs\n- antifake allow 225,33 — liste blanche : seuls ces indicatifs entrent\n- antifake disallow 91,92 — liste noire : ces indicatifs sont refusés\n- antifake remove 91 — retirer un indicatif\n- antifake clear — tout effacer\n- antifake on | off — activer/désactiver`
    if (!match) return m.reply(example)
    const cmd = match.split(/\s+/)[0].toLowerCase()
    const args = match.slice(cmd.length).trim()

    if (cmd === 'on' || cmd === 'off') {
      save(m.jid, { ...cfg, enabled: cmd === 'on' })
      return m.reply(`Antifake est maintenant *${cmd === 'on' ? 'activé' : 'désactivé'}*.`)
    }
    if (cmd === 'list') {
      if (!cfg.codes.length) return m.reply('Aucun indicatif à lister.')
      const title = cfg.mode === 'allow' ? 'Mode liste blanche (seuls ces indicatifs sont acceptés)' : 'Mode liste noire (ces indicatifs sont refusés)'
      return m.reply(`*${title}*\n\n${cfg.codes.map((c, i) => `${i + 1}. ${cfg.mode === 'allow' ? '✅' : '🚫'} +${c}`).join('\n')}`)
    }
    if (cmd === 'allow' || cmd === 'add' || cmd === 'disallow') {
      if (!args) return m.reply(`*Donnez des indicatifs.* Exemple : antifake ${cmd} 225,33`)
      const mode = cmd === 'disallow' ? 'deny' : 'allow'
      if (cfg.mode && cfg.mode !== mode && cfg.codes.length) {
        return m.reply(`*⚠️ Impossible de mélanger les modes !*\n_Le groupe est en mode ${cfg.mode === 'allow' ? 'liste blanche' : 'liste noire'}. Utilisez_ *antifake clear* _d'abord._`)
      }
      const list = [...new Set([...cfg.codes, ...codes(args)])]
      save(m.jid, { enabled: true, mode, codes: list })
      return m.reply(
        mode === 'allow'
          ? `*✅ Indicatifs autorisés (liste blanche) :*\n${codes(args).map((c) => '+' + c).join(', ')}\n\n_Tous les autres seront refusés._`
          : `*🚫 Indicatifs refusés (liste noire) :*\n${codes(args).map((c) => '+' + c).join(', ')}\n\n_Tous les autres seront acceptés._`
      )
    }
    if (cmd === 'remove') {
      if (!args) return m.reply('*Donnez les indicatifs à retirer.*')
      const rm = codes(args)
      save(m.jid, { ...cfg, codes: cfg.codes.filter((c) => !rm.includes(c)) })
      return m.reply(`*Indicatifs retirés :*\n${rm.map((c) => '+' + c).join(', ')}`)
    }
    if (cmd === 'clear') {
      save(m.jid, { enabled: false, mode: null, codes: [] })
      return m.reply('*🗑️ Liste antifake effacée.*')
    }
    return m.reply(example)
  }
)

const blocked = (cfg, number) => {
  if (!cfg.codes.length) return false
  const match = cfg.codes.some((c) => number.startsWith(c))
  return cfg.mode === 'allow' ? !match : match
}

bot({ on: 'participants' }, async (ev, ctx) => {
  if (ev.action !== 'add') return
  const cfg = get(ev.id)
  if (!cfg.enabled || !cfg.codes.length) return
  const meta = await ctx.sock.groupMetadata(ev.id).catch(() => null)
  const toRemove = []
  for (const p of ev.participants) {
    const id = typeof p === 'string' ? p : p.id
    // En mode LID, le numéro réel n'est connu que via phoneNumber
    const phone = typeof p === 'string' ? (id.endsWith('@s.whatsapp.net') ? id : null) : p.phoneNumber || (id.endsWith('@s.whatsapp.net') ? id : null)
    if (!phone) continue
    if (blocked(cfg, jidNum(phone))) toRemove.push(id)
  }
  if (toRemove.length && meta) await ctx.sock.groupParticipantsUpdate(ev.id, toRemove, 'remove').catch(() => {})
})
