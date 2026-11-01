const { bot, db, find } = require('../lib')

bot(
  { name: 'tog', desc: 'Active/désactive une commande du bot (tog ping off)', type: 'bot', owner: true },
  async (m, match) => {
    const [cmd, state] = match.toLowerCase().split(/\s+/)
    if (!cmd || (state !== 'on' && state !== 'off')) return m.reply('Exemple : tog ping off\n(tog <commande> on|off)')
    if (cmd === 'tog') return m.reply('Vous voulez vraiment me tuer ? 😅')
    const target = find(cmd)
    if (!target) return m.reply(`Commande inconnue : ${cmd}`)

    const list = new Set(db.get('global', 'disabled', []))
    state === 'off' ? list.add(target.name) : list.delete(target.name)
    db.set('global', 'disabled', [...list])
    await m.reply(state === 'on' ? `${target.name} activée.` : `${target.name} désactivée.`)
  }
)
