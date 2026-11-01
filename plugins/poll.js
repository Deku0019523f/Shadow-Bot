const { bot } = require('../lib')

bot(
  { name: 'poll', desc: 'Crée un sondage WhatsApp : poll question,option1,option2,…', type: 'whatsapp', owner: true },
  async (m, match) => {
    const parts = match.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length < 3) return m.reply('*Exemple : poll question,option1,option2,...*')
    const [name, ...values] = parts
    if (values.length > 12) return m.reply('Un sondage accepte 12 options maximum.')
    await m.sendContent({ poll: { name, values, selectableCount: 1 } })
  }
)
