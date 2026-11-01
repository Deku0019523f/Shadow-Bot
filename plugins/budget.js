const { bot, db, utils } = require('../lib')
const { localParts } = utils

// Budget personnel (par utilisateur) : income / expense / delbudget / summary / budget
//   income salaire,500,remarque · expense cinéma,200,film · budget j'ai dépensé 50 pour le café
const all = () => db.get('global', 'budget', [])
const save = (v) => db.set('global', 'budget', v)
const mine = (m) => all().filter((e) => e.user === m.sender)
const month = (ts = Date.now()) => localParts(new Date(ts)).date.slice(0, 7)
const fmt = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const total = (list, type) => list.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0)

function add(m, type, category, amount, remark) {
  const entries = all()
  const id = (Math.max(0, ...entries.map((e) => e.id)) + 1)
  save([...entries, { id, user: m.sender, type, category, amount, remark: remark || '', at: Date.now() }])
  const cur = mine(m).filter((e) => month(e.at) === month())
  return total(cur, type)
}

const parse = (match) => {
  const [category, amount, ...rest] = match.split(',').map((s) => s.trim())
  const n = Number(String(amount).replace(/\s/g, '').replace(',', '.'))
  return category && Number.isFinite(n) && n > 0 ? { category, amount: n, remark: rest.join(', ') } : null
}

for (const [name, label, type] of [['income', 'revenu', 'income'], ['expense', 'dépense', 'expense']]) {
  bot({ name, desc: `Enregistre un ${label} (${name} type,montant,remarque)`, type: 'budget' }, async (m, match) => {
    const p = match && parse(match)
    if (!p) return m.reply(`*Type manquant ou montant invalide*\n*Exemple : ${name} ${type === 'income' ? 'salaire, 500' : 'cinéma, 200, film'}*\n\n_La remarque est facultative_`)
    const t = add(m, type, p.category, p.amount, p.remark)
    await m.reply(`*Total des ${type === 'income' ? 'revenus' : 'dépenses'} du mois : ${fmt(t)}*`)
  })
}

bot({ name: 'delbudget', desc: 'Supprime une ligne du budget (delbudget id — id visible dans summary)', type: 'budget' }, async (m, match) => {
  const id = Number(match)
  if (!id) return m.reply('*Exemple : delbudget id*\n_L\'id est affiché par summary. Pour modifier un montant, saisissez-le à nouveau._')
  const e = mine(m).find((x) => x.id === id)
  if (!e) return m.reply(`_${id} n'est pas dans la liste._`)
  save(all().filter((x) => x.id !== id))
  await m.reply(`_${id} retiré de la liste._`)
})

bot({ name: 'summary', desc: 'Résumé du budget (summary — mois en cours · summary 2026-10 · summary 01/10/2026,31/10/2026)', type: 'budget' }, async (m, match) => {
  let list = mine(m)
  let title
  const range = match.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (range) {
    const a = new Date(`${range[3]}-${range[2].padStart(2, '0')}-${range[1].padStart(2, '0')}T00:00:00Z`).getTime()
    const b = new Date(`${range[6]}-${range[5].padStart(2, '0')}-${range[4].padStart(2, '0')}T23:59:59Z`).getTime()
    list = list.filter((e) => e.at >= a && e.at <= b)
    title = `du ${range[1]}/${range[2]}/${range[3]} au ${range[4]}/${range[5]}/${range[6]}`
  } else {
    const mo = /^\d{4}-\d{2}$/.test(match) ? match : month()
    list = list.filter((e) => month(e.at) === mo)
    title = mo
  }
  if (!list.length) return m.reply(`Aucune écriture (${title}).\n_Exemple : income salaire, 500 · expense café, 5_`)
  const inc = total(list, 'income')
  const exp = total(list, 'expense')
  const line = (e) => `${e.id}. ${e.type === 'income' ? '➕' : '➖'} ${e.category} — ${fmt(e.amount)}${e.remark ? ` (${e.remark})` : ''}`
  await m.reply(`*Budget ${title}*\n\n${list.map(line).join('\n')}\n\n*Revenus :* ${fmt(inc)}\n*Dépenses :* ${fmt(exp)}\n*Solde :* ${fmt(inc - exp)}`)
})

const INCOME = /\b(salaire|salary|revenu|income|re[cç]u|gagn[eé]|got|received|earned|pay[eé]\s+par|prime|bonus|vente)\b/i
bot({ name: 'budget', desc: 'Saisie en langage naturel (budget j\'ai dépensé 50 pour le café)', type: 'budget' }, async (m, match) => {
  if (!match) return m.reply('*Décrivez votre opération*\n\n_budget j\'ai dépensé 50 pour le café_\n_budget reçu salaire 3000_\n_budget loyer payé 200_\n_budget taxi 15_')
  const num = match.match(/(\d[\d\s]*(?:[.,]\d+)?)/)
  const amount = num && Number(num[1].replace(/\s/g, '').replace(',', '.'))
  if (!amount) return m.reply('*Je n\'ai pas compris l\'opération.*\n\n_Exemple : budget dépensé 50 pour le café_')
  const type = INCOME.test(match) ? 'income' : 'expense'
  const rest = match.replace(num[0], ' ').replace(/(?<![\p{L}])(j'ai|j’ai|dépensé|depense|dépense|dépensée|spent|paid|payé|paye|reçu|recu|got|received|gagné|pour|sur|on|for|de|du|la|le|les|un|une|d'|en)(?![\p{L}])/giu, ' ').replace(/\s+/g, ' ').trim()
  const category = rest.split(' ').slice(0, 3).join(' ') || (type === 'income' ? 'revenu' : 'divers')
  const t = add(m, type, category, amount, match.length > 60 ? match.slice(0, 60) : match)
  await m.reply(`*${type === 'income' ? 'Revenu' : 'Dépense'} enregistré(e)*\n_Montant : ${fmt(amount)}_\n_Catégorie : ${category}_\n\n*Total ${type === 'income' ? 'revenus' : 'dépenses'} du mois : ${fmt(t)}*`)
})
