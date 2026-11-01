const { bot, db } = require('../lib')
const google = require('../lib/google')
const schedule = require('../lib/schedule')

// Google Tasks (nécessite gauth) :
//   task list · task list-lists · task list-switch <nom> · task add <texte [date]> · task <texte>
//   task del <n> · task done <n> · task update <n> <texte>
const API = 'https://tasks.googleapis.com/tasks/v1'
const listId = () => db.get('global', 'gtasklist', '@default')
const last = new Map() // expéditeur -> ids de la dernière liste affichée

async function pending() {
  const r = await google.api('GET', `${API}/lists/${listId()}/tasks?showCompleted=false&maxResults=100`)
  return r.items || []
}

bot({ name: 'task', aliases: ['tasks'], desc: 'Google Tasks (task list | add texte | del n | done n | update n texte | list-lists | list-switch nom)', type: 'organisation', owner: true }, async (m, match) => {
  const usage = 'Usage : task <list | list-lists | list-switch <nom> | add <texte> | del <n> | done <n> | update <n> <texte> | <texte>>'
  if (!google.isAuthed()) return m.reply('Authentification requise : utilisez *gauth auth* (avec les permissions Google Tasks).')
  const [sub = '', ...rest] = match.trim().split(/\s+/)
  const arg = rest.join(' ').trim()
  try {
    if (!match || sub === 'list') {
      const items = await pending()
      last.set(m.sender, items.map((t) => t.id))
      if (!items.length) return m.reply('Aucune tâche.')
      return m.reply(`📝 *Tâches (${items.length})* :\n\n${items.map((t, i) => `${i + 1}. ${t.title}${t.due ? ` — échéance ${t.due.slice(0, 10)}` : ''}`).join('\n')}`)
    }
    if (sub === 'list-lists') {
      const r = await google.api('GET', `${API}/users/@me/lists`)
      return m.reply(`📝 *Listes de tâches :*\n\n${(r.items || []).map((l, i) => `${i + 1}. ${l.title}${l.id === listId() ? ' ✅' : ''}`).join('\n')}`)
    }
    if (sub === 'list-switch') {
      if (!arg) return m.reply(usage)
      const r = await google.api('GET', `${API}/users/@me/lists`)
      const l = (r.items || []).find((x) => x.title.toLowerCase() === arg.toLowerCase())
      if (!l) return m.reply('Liste introuvable (task list-lists).')
      db.set('global', 'gtasklist', l.id)
      return m.reply(`Liste par défaut : *${l.title}*`)
    }
    if (['del', 'done', 'update'].includes(sub)) {
      const [n, ...txt] = arg.split(/\s+/)
      const ids = last.get(m.sender) || (await pending()).map((t) => t.id)
      const id = ids[Number(n) - 1]
      if (!id) return m.reply('Tâche introuvable. Faites d\'abord : task list')
      const url = `${API}/lists/${listId()}/tasks/${id}`
      if (sub === 'del') {
        await google.api('DELETE', url)
        return m.reply('Tâche supprimée.')
      }
      if (sub === 'done') {
        const t = await google.api('PATCH', url, { json: { status: 'completed' } })
        return m.reply(`Tâche *${t.title}* marquée comme terminée.`)
      }
      if (!txt.length) return m.reply(usage)
      const t = await google.api('PATCH', url, { json: { title: txt.join(' ') } })
      return m.reply(`Tâche mise à jour : *${t.title}*`)
    }
    const text = sub === 'add' ? arg : match.trim()
    if (!text) return m.reply(usage)
    const n = schedule.natural(text)
    const title = (n && n.rest) || text
    const body = { title, ...(n ? { due: new Date(n.at).toISOString() } : {}) }
    await google.api('POST', `${API}/lists/${listId()}/tasks`, { json: body })
    await m.reply(`Tâche ajoutée : *${title}*${n ? `\nÉchéance : ${schedule.show(n.at)}` : ''}`)
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
})
