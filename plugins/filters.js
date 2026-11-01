const { bot, db } = require('../lib')
const { findReply, upsert } = require('../lib/filters')

// Filtres de groupe : filter <mot> (en réponse à un texte) · filter list · stop <mot>
const get = (jid) => db.get(`group:${jid}`, 'filters', [])
const save = (jid, v) => db.set(`group:${jid}`, 'filters', v)

bot(
  { name: 'filter', desc: 'Réponse automatique à un mot (filter salut, en répondant à un texte) — filter list', type: 'réponses auto', onlyGroup: true, admin: true },
  async (m, match) => {
    const example = '> *Exemple :*\n- filter salut (en répondant à un message texte)\n- filter list (affiche les filtres actuels)'
    if (!match) return m.reply(example)
    if (match === 'list' && !m.quoted) {
      const list = get(m.jid)
      if (!list.length) return m.reply(example)
      return m.reply(`> *Filtres actuels :*\n${list.map((f) => `- ${f.pattern}`).join('\n')}`)
    }
    if (!m.quoted?.text) return m.reply('Répondez à un message texte.')
    save(m.jid, upsert(get(m.jid), match, m.quoted.text))
    await m.reply(`Filtre *${match}* ajouté`)
  }
)

bot(
  { name: 'stop', desc: 'Supprime un filtre du groupe (stop salut)', type: 'réponses auto', onlyGroup: true, admin: true },
  async (m, match) => {
    if (!match) return m.reply('> *Utilisation :*\n- stop <filtre>\n- stop salut')
    const list = get(m.jid)
    const rest = list.filter((f) => f.pattern.toLowerCase() !== match.toLowerCase())
    if (rest.length === list.length) return m.reply(`_${match} non trouvé dans les filtres._`)
    save(m.jid, rest)
    await m.reply(`${match} supprimé`)
  }
)

bot({ on: 'message' }, async (m, ctx) => {
  if (!m.isGroup || m.fromMe || !m.text || m.text.startsWith(ctx.PREFIX)) return
  const reply = findReply(get(m.jid), m.text)
  if (reply) await m.reply(reply)
})
