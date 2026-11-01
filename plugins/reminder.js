const { bot, db, utils } = require('../lib')
const schedule = require('../lib/schedule')
const google = require('../lib/google')
const { jidNum } = utils

// Rappels : reminder demain à 10h réunion · reminder list · reminder del <n>
// Le rappel est envoyé ici par le bot ; si Google est connecté (gauth), il est aussi ajouté à l'Agenda.
const get = () => db.get('global', 'reminders', [])
const save = (v) => db.set('global', 'reminders', v)

bot({ name: 'reminder', aliases: ['rappel'], desc: 'Rappel (reminder demain à 10h réunion · reminder list · reminder del 1)', type: 'organisation' }, async (m, match) => {
  const usage = '*Rappels :*\n- reminder <texte avec date> (ex : reminder demain à 10h réunion)\n- reminder dans 2 heures appeler Paul\n- reminder tous les jours à 8h30 sport\n- reminder list\n- reminder del <numéro>'
  if (!match) return m.reply(usage)
  const mine = get().filter((r) => r.owner === m.sender)
  if (match === 'list') {
    return m.reply(mine.length ? `*Rappels à venir :*\n\n${mine.map((r, i) => `${i + 1}. ${schedule.show(r.at)}${r.repeat ? ' 🔁' : ''} — ${r.text}`).join('\n')}` : 'Aucun rappel à venir.')
  }
  const del = match.match(/^(?:del|delete|supprimer)\s+(\d+)$/i)
  if (del) {
    const r = mine[Number(del[1]) - 1]
    if (!r) return m.reply('Numéro invalide.')
    save(get().filter((x) => x !== r && x.id !== r.id))
    return m.reply('Rappel supprimé.')
  }
  const n = schedule.natural(match)
  if (!n) return m.reply(`Je n'ai pas compris la date.\n\n${usage}`)
  const text = n.rest || 'Rappel'
  const r = { id: Date.now().toString(36), at: n.at, repeat: n.repeat, text, jid: m.jid, owner: m.sender }
  save([...get(), r])
  let extra = ''
  if (google.isAuthed()) {
    try {
      const end = new Date(n.at + 3_600_000).toISOString()
      await google.api('POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events', { json: { summary: text, start: { dateTime: new Date(n.at).toISOString() }, end: { dateTime: end }, ...(n.repeat ? { recurrence: ['RRULE:FREQ=DAILY'] } : {}) } })
      extra = '\n📅 Ajouté à Google Agenda.'
    } catch (e) {
      extra = `\n⚠️ Agenda : ${e.message}`
    }
  }
  await m.reply(`*Rappel enregistré !*\n*Quoi :* ${text}\n*Quand :* ${schedule.show(n.at)}${n.repeat ? ' (tous les jours)' : ''}${extra}`)
})

bot({ on: 'tick' }, async (sock) => {
  const list = get()
  const due = list.filter((r) => r.at <= Date.now())
  if (!due.length) return
  save(list.flatMap((r) => (r.at > Date.now() ? [r] : r.repeat ? [{ ...r, at: r.at + 86_400_000 * Math.max(1, Math.ceil((Date.now() - r.at) / 86_400_000)) }] : [])))
  for (const r of due) {
    await sock.sendMessage(r.jid, { text: `⏰ *Rappel* @${jidNum(r.owner)}\n${r.text}`, mentions: [r.owner] }).catch(() => {})
  }
})
