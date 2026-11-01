const { bot, db, utils } = require('../lib')
const { jidNum, norm, formatUptime } = utils

// Compteur de messages par membre et par groupe.
// Les données vivent en mémoire et sont écrites en base toutes les ~30 s (pas à chaque message).
//   groupe -> { [jid membre]: { name, total, time, items: { texte: n, image: n, … } } }
const LABELS = {
  conversation: 'texte', extendedTextMessage: 'texte', imageMessage: 'image', videoMessage: 'vidéo',
  audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document', contactMessage: 'contact',
  locationMessage: 'position', pollCreationMessage: 'sondage', reactionMessage: null, protocolMessage: null,
}
const cache = new Map() // jid groupe -> données
const dirty = new Set()

const load = (jid) => {
  if (!cache.has(jid)) cache.set(jid, db.get(`group:${jid}`, 'msgs', {}))
  return cache.get(jid)
}
const touch = (jid) => dirty.add(jid)
const flush = () => {
  for (const jid of dirty) db.set(`group:${jid}`, 'msgs', cache.get(jid))
  dirty.clear()
}

bot({ on: 'message' }, async (m) => {
  if (!m.isGroup || !m.type) return
  const label = m.type in LABELS ? LABELS[m.type] : 'autre'
  if (label === null) return
  const data = load(m.jid)
  const u = (data[m.sender] ||= { name: '', total: 0, time: 0, items: {} })
  u.name = m.pushName || u.name
  u.total += 1
  u.time = Date.now()
  u.items[label] = (u.items[label] || 0) + 1
  touch(m.jid)
})
bot({ on: 'tick' }, async () => flush())

const render = (jid, d, now) => {
  const items = Object.entries(d.items).map(([k, v]) => `*${k} :* ${v}`).join('\n')
  const ago = d.time ? formatUptime((now - d.time) / 1000) : '—'
  return `\n*Numéro :* ${jidNum(jid)}\n*Nom :* ${d.name || ''}\n*Total des messages :* ${d.total}\n${items}\n*Dernière vue :* il y a ${ago}\n`
}

bot(
  { name: 'msgs', desc: 'Nombre de messages par membre (msgs @membre pour un seul)', type: 'groupe', onlyGroup: true },
  async (m) => {
    flush()
    const data = load(m.jid)
    const user = m.mentioned[0] || m.quoted?.sender
    const now = Date.now()
    if (user) {
      const d = data[norm(user)]
      if (!d) return m.reply('Aucune activité enregistrée pour le moment.')
      return m.send(render(user, d, now).trim(), { mentions: [user] })
    }
    const rows = Object.entries(data).sort((a, b) => b[1].total - a[1].total)
    if (!rows.length) return m.reply('Aucune activité enregistrée pour le moment.')
    const top = rows.slice(0, 25)
    const text = top.map(([jid, d]) => render(jid, d, now)).join('').trim()
    await m.send(text + (rows.length > 25 ? `\n\n_… et ${rows.length - 25} autres membres (top 25 affiché)._` : ''))
  }
)

bot(
  { name: 'reset', desc: 'Remet à zéro les compteurs (reset all | reset @membre)', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match) => {
    const user = m.quoted?.sender || m.mentioned[0]
    if (!user && match !== 'all') return m.reply('Exemple : reset all OU reset <répondre/mentionner>')
    const data = load(m.jid)
    if (match === 'all') {
      for (const k of Object.keys(data)) delete data[k]
      touch(m.jid)
      flush()
      return m.reply('Les compteurs de messages de tout le monde ont été supprimés')
    }
    delete data[norm(user)]
    touch(m.jid)
    flush()
    await m.send(`_Les compteurs de messages de @${jidNum(user)} ont été supprimés._`, { mentions: [user] })
  }
)

bot(
  { name: 'inactive', desc: 'Liste/expulse les inactifs (inactive day 10 total 50 kick)', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match, ctx) => {
    const usage = "> Exemples :\n- inactive day 10\n- inactive day 10 kick\n- inactive total 100\n- inactive total 100 kick\n- inactive day 7 total 150\n- inactive day 7 total 150 kick\n\nSans 'kick', les inactifs sont seulement listés."
    const args = match.toLowerCase().split(/\s+/).filter(Boolean)
    const kick = args.includes('kick')
    const num = (key) => {
      const i = args.indexOf(key)
      const v = i >= 0 ? Number(args[i + 1]) : NaN
      return Number.isFinite(v) ? v : null
    }
    const days = num('day')
    const total = num('total')
    if (days === null && total === null) return m.reply(usage)

    flush()
    const data = load(m.jid)
    const me = [m.sock.user?.id, m.sock.user?.lid].filter(Boolean).map(norm)
    const now = Date.now()
    const out = []
    for (const p of ctx.group.meta.participants) {
      const id = norm(p.id)
      if (p.admin || me.includes(id)) continue
      const d = data[id] || { total: 0, time: 0 }
      const okDay = days === null || (d.time === 0 ? true : (now - d.time) / 86_400_000 >= days)
      const okTotal = total === null || d.total <= total
      if (okDay && okTotal) out.push(p.id)
    }
    if (!out.length) return m.reply('_Total des inactifs : 0_')
    if (kick) {
      if (!ctx.group.isBotAdmin) return m.reply('⚠️ Je dois être admin du groupe pour faire ça.')
      await m.reply(`_Suppression de ${out.length} membres inactifs dans 7 secondes_`)
      await utils.sleep(7000)
      for (let i = 0; i < out.length; i += 20) await m.sock.groupParticipantsUpdate(m.jid, out.slice(i, i + 20), 'remove').catch(() => {})
      return
    }
    await m.send(`_Total des inactifs : ${out.length}_\n` + out.map((id, i) => `\n*${i + 1}.* @${jidNum(id)}`).join(''), { mentions: out })
  }
)
