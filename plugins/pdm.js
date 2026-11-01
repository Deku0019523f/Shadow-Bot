const { bot, db, utils } = require('../lib')
const { jidNum } = utils

bot(
  { name: 'pdm', desc: 'Alerte quand un membre est promu/rétrogradé admin (pdm on | off)', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match) => {
    const v = match.toLowerCase()
    if (!v) return m.reply('Utilisation : pdm on | off')
    if (v !== 'on' && v !== 'off') return m.reply("Précisez 'on' ou 'off'. Par exemple : pdm on")
    db.set(`group:${m.jid}`, 'pdm', v === 'on')
    await m.reply(v === 'on' ? 'Alerte de promotion/rétrogradation activée.' : 'Alerte de promotion/rétrogradation désactivée.')
  }
)

bot({ on: 'participants' }, async (ev, ctx) => {
  if (ev.action !== 'promote' && ev.action !== 'demote') return
  if (!db.get(`group:${ev.id}`, 'pdm', false)) return
  const ids = ev.participants.map((p) => (typeof p === 'string' ? p : p.id))
  const author = ev.author ? ` par @${jidNum(ev.author)}` : ''
  const text =
    ev.action === 'promote'
      ? `🔼 ${ids.map((i) => '@' + jidNum(i)).join(', ')} a/ont été promu(s) admin${author}.`
      : `🔽 ${ids.map((i) => '@' + jidNum(i)).join(', ')} n'est/ne sont plus admin${author}.`
  await ctx.sock.sendMessage(ev.id, { text, mentions: [...ids, ...(ev.author ? [ev.author] : [])] })
})
