const { bot, db } = require('../lib')
const { findReply, upsert } = require('../lib/filters')

// Filtres globaux : gfilter/gstop (tous les groupes) · pfilter/pstop (tous les chats privés)
const KINDS = {
  gfilter: { stop: 'gstop', label: 'Gfiltre', where: 'tous les groupes' },
  pfilter: { stop: 'pstop', label: 'Pfiltre', where: 'tous les chats privés' },
}
const get = (k) => db.get('global', k, [])

for (const [name, k] of Object.entries(KINDS)) {
  bot(
    { name, desc: `Réponse automatique dans ${k.where} (${name} salut, en répondant à un texte | ${name} list)`, type: 'réponses auto', owner: true },
    async (m, match) => {
      const example = `> *Exemple :*\n- ${name} salut (en répondant à un message texte)\n- ${name} list (affiche les filtres actuels)`
      if (!match) return m.reply(example)
      if (match === 'list' && !m.quoted) {
        const list = get(name)
        if (!list.length) return m.reply(example)
        return m.reply(`> *${k.label}s actuels :*\n${list.map((f) => `- ${f.pattern}`).join('\n')}`)
      }
      if (!m.quoted?.text) return m.reply('Répondez à un message texte.')
      db.set('global', name, upsert(get(name), match, m.quoted.text))
      await m.reply(`${k.label} *${match}* ajouté`)
    }
  )

  bot(
    { name: k.stop, desc: `Supprime un ${name} (${k.stop} salut)`, type: 'réponses auto', owner: true },
    async (m, match) => {
      if (!match) return m.reply(`> *Utilisation :*\n- ${k.stop} <filtre>\n- ${k.stop} salut`)
      const list = get(name)
      const rest = list.filter((f) => f.pattern.toLowerCase() !== match.toLowerCase())
      if (rest.length === list.length) return m.reply(`_${match} non trouvé dans les ${name}s._`)
      db.set('global', name, rest)
      await m.reply(`${match} supprimé`)
    }
  )
}

bot({ on: 'message' }, async (m, ctx) => {
  if (m.fromMe || !m.text || m.text.startsWith(ctx.PREFIX)) return
  const reply = findReply(get(m.isGroup ? 'gfilter' : 'pfilter'), m.text)
  if (reply) await m.reply(reply)
})
