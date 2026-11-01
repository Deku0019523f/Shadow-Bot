const { bot, db, find, utils } = require('../lib')
const { jidNum } = utils

// zushi / yami / ope : commandes autorisées pour tout le monde dans CE chat quand le bot est en mode privé
//   zushi ping sticker   autorise · yami   liste · ope ping   retire · ope all   retire tout
const all = () => db.get('global', 'allowed', {})
const save = (jid, list) => {
  const a = all()
  if (list.length) a[jid] = list
  else delete a[jid]
  db.set('global', 'allowed', a)
}
const words = (s) => [...new Set(s.toLowerCase().split(/[\s,]+/).filter(Boolean))]
const where = (m) => (m.isGroup ? m.jid : '@' + jidNum(m.jid))
const OWN = { type: 'logia', owner: true }

bot({ name: 'zushi', desc: 'Autorise des commandes pour tous dans ce chat (zushi ping sticker)', ...OWN }, async (m, match) => {
  if (!match) return m.reply('⚠️ Indiquez des commandes.\nExemple : zushi song video sticker\n_Utile quand le bot est en mode privé._')
  const cur = all()[m.jid] || []
  const names = words(match)
  const valid = []
  const invalid = []
  for (const n of names) {
    const c = find(n)
    if (!c) invalid.push(n)
    else if (c.owner) invalid.push(`${n} (réservée au propriétaire)`)
    else if (!valid.includes(c.name) && !cur.includes(c.name)) valid.push(c.name)
  }
  if (!valid.length) return m.reply(invalid.length ? `⚠️ Aucune commande valide à ajouter.\nIgnorées : ${invalid.join(', ')}` : 'Ces commandes sont déjà autorisées. (yami pour la liste)')
  const next = [...cur, ...valid]
  save(m.jid, next)
  await m.reply(`✅ Ajoutée${valid.length > 1 ? 's' : ''} : ${valid.join(', ')}${invalid.length ? `\n⚠️ Ignorées : ${invalid.join(', ')}` : ''}\n\n📊 Autorisées dans ${where(m)} : ${next.length}`)
})

bot({ name: 'yami', desc: 'Liste des commandes autorisées dans ce chat', ...OWN }, async (m) => {
  const cur = all()[m.jid] || []
  if (!cur.length) return m.reply('📋 Aucune commande autorisée ici.\nExemple : zushi song video sticker')
  await m.reply(`📋 *Commandes autorisées* (${where(m)}) :\n\n${cur.map((c) => `- ${c}`).join('\n')}\n\n📊 Total : ${cur.length}\nRetirer : ope <noms> · ope all`)
})

bot({ name: 'ope', desc: 'Retire des commandes autorisées (ope ping sticker · ope all)', ...OWN }, async (m, match) => {
  const cur = all()[m.jid] || []
  if (!match) return m.reply('Exemple : ope song video\nou : ope all')
  if (!cur.length) return m.reply('⚠️ Aucune commande autorisée ici. (zushi pour en ajouter)')
  if (match.toLowerCase() === 'all') {
    save(m.jid, [])
    return m.reply('✅ Toutes les commandes autorisées ont été retirées.')
  }
  const names = words(match).map((n) => find(n)?.name || n)
  const removed = names.filter((n) => cur.includes(n))
  const missing = names.filter((n) => !cur.includes(n))
  if (!removed.length) return m.reply(`❌ Introuvable(s) : ${missing.join(', ')}\n(yami pour la liste)`)
  save(m.jid, cur.filter((c) => !removed.includes(c)))
  await m.reply(`✅ Retirée${removed.length > 1 ? 's' : ''} : ${removed.join(', ')}${missing.length ? `\n❌ Introuvable(s) : ${missing.join(', ')}` : ''}`)
})
