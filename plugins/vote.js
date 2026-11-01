const { bot, db, utils } = require('../lib')
const { jidNum, sleep, norm } = utils

// Vote dans un groupe.
//   vote q|Question ?⏎o|😀|Bleu⏎o|😊|Rouge [jid-groupe…]    crée le vote
//   vote            résultats en cours    ·    vote delete    supprime le vote
// On vote en répondant au message du vote avec le numéro ou l'emoji de l'option, ou en réagissant avec l'emoji.
const get = (jid) => db.get(`group:${jid}`, 'vote', null)
const save = (jid, v) => (v ? db.set(`group:${jid}`, 'vote', v) : db.del(`group:${jid}`, 'vote'))

const tally = (v) => {
  const counts = v.options.map(() => 0)
  for (const idx of Object.values(v.votes)) counts[idx] += 1
  const total = counts.reduce((a, b) => a + b, 0)
  return { counts, total }
}

const results = (v) => {
  const { counts, total } = tally(v)
  const lines = v.options.map((o, i) => `${i + 1}. ${o.emoji} ${o.label} — *${counts[i]}*${total ? ` (${Math.round((counts[i] / total) * 100)}%)` : ''}`)
  return `*${v.question}*\n\n${lines.join('\n')}\n\nTotal des votes : *${total}*`
}

const announce = (v) => `📊 ${results(v)}\n\nRéagissez ou répondez à une option (numéro ou emoji) pour voter.`

bot(
  { name: 'vote', desc: 'Lance un vote : vote q|Question ⏎ o|😀|Option … (vote delete pour supprimer)', type: 'groupe', onlyGroup: true },
  async (m, match) => {
    const usage = '> Exemple :\nvote q|Quelle est votre couleur préférée ?\no|😀|Bleu\no|😊|Rouge'
    const current = get(m.jid)
    if (!match) return current ? m.reply(results(current)) : m.reply(`Aucun vote disponible !\n\n${usage}`)

    if (match.toLowerCase() === 'delete') {
      if (!(await m.groupInfo()).isAdmin && !m.isOwner) return m.reply('⛔ Réservé aux admins du groupe.')
      save(m.jid, null)
      return m.reply('_Vote supprimé._')
    }
    if (!(await m.groupInfo()).isAdmin && !m.isOwner) return m.reply('⛔ Réservé aux admins du groupe.')
    if (current) return m.reply('Supprimez le vote actuel (vote delete) pour en définir un nouveau.')

    const targets = match.match(/\d+(?:-\d+)?@g\.us/g) || []
    const lines = match.replace(/\d+(?:-\d+)?@g\.us/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
    const question = lines.find((l) => /^q\|/i.test(l))?.slice(2).trim()
    const options = lines
      .filter((l) => /^o\|/i.test(l))
      .map((l) => l.split('|').slice(1).map((s) => s.trim()))
      .map((p) => (p.length >= 2 ? { emoji: p[0], label: p.slice(1).join('|') } : null))
      .filter(Boolean)
    if (!question) return m.reply(`Question requise\n\n${usage}`)
    if (options.length < 2) return m.reply(`Deux options ou plus requises\n\n${usage}`)

    const vote = { question, options, votes: {}, msgIds: [] }
    for (const jid of targets.length ? targets : [m.jid]) {
      const copy = { ...vote, votes: {}, msgIds: [] }
      const sent = await m.sock.sendMessage(jid, { text: announce(copy) })
      copy.msgIds = [sent.key.id]
      save(jid, copy)
      if (targets.length) await sleep(5000)
    }
  }
)

function cast(m, v, idx) {
  v.votes[norm(m.sender)] = idx
  save(m.jid, v)
  const o = v.options[idx]
  return m.send(`@${jidNum(m.sender)} a voté pour ${o.emoji} ${o.label}\n\n${results(v)}`, { mentions: [m.sender] })
}

const indexOf = (v, text) => {
  const t = text.trim()
  if (/^\d{1,2}$/.test(t) && Number(t) >= 1 && Number(t) <= v.options.length) return Number(t) - 1
  const i = v.options.findIndex((o) => o.emoji === t)
  return i >= 0 ? i : -1
}

bot({ on: 'message' }, async (m) => {
  if (!m.isGroup || m.fromMe) return
  const v = get(m.jid)
  if (!v) return

  // Réaction à un message du vote
  const react = m.raw.message?.reactionMessage
  if (react?.key?.id && v.msgIds.includes(react.key.id) && react.text) {
    const i = v.options.findIndex((o) => o.emoji === react.text)
    if (i >= 0) return cast(m, v, i)
    return
  }
  // Réponse (citation) à un message du vote
  if (m.quoted?.key?.id && v.msgIds.includes(m.quoted.key.id) && m.text) {
    const i = indexOf(v, m.text)
    if (i >= 0) return cast(m, v, i)
  }
})
