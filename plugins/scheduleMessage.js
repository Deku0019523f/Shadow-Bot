const { bot, db, utils } = require('../lib')
const schedule = require('../lib/schedule')
const { jidNum, toJid } = utils

// Messages programmés (répondre au message à envoyer) :
//   setschedule demain à 10h · setschedule tous les jours à 8h · setschedule 0-10 (chat actuel, min-heure[-jour[-mois]])
//   setschedule jid,30-14-25-12
//   getschedule [jid] · delschedule jid,heure · delschedule jid · delschedule all
const get = () => db.get('global', 'schedules', [])
const save = (v) => db.set('global', 'schedules', v)
const MAX = 8 * 1024 * 1024

const targetOf = (s) => (/@/.test(s) ? s : toJid(s))

bot({ name: 'setschedule', desc: 'Programme un message (répondre au message : setschedule demain à 10h)', type: 'organisation', owner: true }, async (m, match) => {
  const usage = '> *Exemples :*\n- setschedule jid,min-heure-jour-mois (24 h, jour/mois facultatifs)\n- setschedule demain à 10h\n- setschedule tous les jours à 10h (répété)\n- setschedule 0-10 (chat actuel, une fois)'
  if (!match) return m.reply(usage)
  if (!m.quoted) return m.reply('Répondez au message que vous voulez programmer.')

  let jid = m.jid
  let spec = match
  const comma = match.match(/^([^,\s]+)\s*,\s*(.+)$/)
  if (comma && (/@/.test(comma[1]) || /^\d{7,}$/.test(comma[1]))) {
    jid = targetOf(comma[1])
    spec = comma[2]
  }
  let at, repeat = false
  if (/^\d{1,2}(-\d{1,2}){1,3}$/.test(spec.trim())) at = schedule.parse(spec)
  else {
    const n = schedule.natural(spec)
    if (n) ({ at, repeat } = n)
  }
  if (!at) return m.reply(`Format ou heure invalide.\n\n${usage}`)

  let content
  const t = m.mediaType
  if (['image', 'video', 'audio'].includes(t)) {
    const buf = await m.downloadMedia()
    if (buf.length > MAX) return m.reply('Média trop lourd pour être programmé (8 Mo max).')
    content = { type: t, data: buf.toString('base64'), caption: m.quoted.text || undefined }
  } else if (m.quoted.text) content = { text: m.quoted.text }
  else return m.reply('Type de message non pris en charge (texte, image, vidéo ou audio).')

  save([...get(), { jid, at, repeat, content }])
  await m.send(`_Message programmé pour le_ *${schedule.show(at)}*${repeat ? ' _(tous les jours)_' : ''} _dans_ @${jidNum(jid)}.`, { mentions: [jid] })
})

bot({ name: 'getschedule', desc: 'Messages programmés (getschedule ou getschedule jid)', type: 'organisation', owner: true }, async (m, match) => {
  const jid = match ? targetOf(match.trim()) : null
  const l = get().filter((s) => !jid || s.jid === jid)
  if (!l.length) return m.reply('Aucun message programmé.')
  await m.reply(l.map((s, i) => `${i + 1}. ${schedule.show(s.at)}${s.repeat ? ' 🔁' : ''} → ${s.jid}\n   ${s.content.text ? s.content.text.slice(0, 60) : '[' + s.content.type + ']'}`).join('\n'))
})

bot({ name: 'delschedule', desc: 'Supprime des messages programmés (delschedule jid,heure · delschedule jid · delschedule all)', type: 'organisation', owner: true }, async (m, match) => {
  if (!match) return m.reply('> Exemples :\n- delschedule 2250700000000@s.whatsapp.net, 30-14-25-12\n- delschedule 2250700000000@s.whatsapp.net\n- delschedule all')
  if (match.trim() === 'all') {
    save([])
    return m.reply('_Tous les messages programmés ont été supprimés._')
  }
  const [j, when] = match.split(',').map((s) => s.trim())
  const jid = targetOf(j)
  const at = when ? schedule.parse(when) : null
  const keep = get().filter((s) => !(s.jid === jid && (!when || Math.abs(s.at - at) < 60_000)))
  if (keep.length === get().length) return m.reply('Programmation introuvable.')
  save(keep)
  await m.reply('_Programmation supprimée._')
})

bot({ on: 'tick' }, async (sock) => {
  const list = get()
  const due = list.filter((s) => s.at <= Date.now())
  if (!due.length) return
  save(list.flatMap((s) => (s.at > Date.now() ? [s] : s.repeat ? [{ ...s, at: s.at + 86_400_000 * Math.max(1, Math.ceil((Date.now() - s.at) / 86_400_000)) }] : [])))
  for (const s of due) {
    const c = s.content
    const msg = c.text ? { text: c.text } : { [c.type]: Buffer.from(c.data, 'base64'), ...(c.type !== 'audio' && c.caption ? { caption: c.caption } : {}) }
    await sock.sendMessage(s.jid, msg).catch(() => {})
  }
})
