const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys')
const { bot, db, config, utils } = require('../lib')
const schedule = require('../lib/schedule')
const { norm, toJid, jidNum } = utils

// Automatisations du compte : status · call · read · online · setstatus · scstatus · gstatus
const cfg = (k, d) => db.get('global', k, d)
const ownerJid = () => toJid(config.OWNER[0])
const csv = (s) => s.split(/[\s,]+/).filter(Boolean).map((j) => (j.includes('@') ? j : toJid(j)))

// --- status : vue automatique des statuts -------------------------------------------------
//   status on | off | no-dl | except-view jid,jid | only-view jid,jid
bot({ name: 'status', desc: 'Vue auto des statuts (status on | off | no-dl | except-view jid | only-view jid)', type: 'compte', owner: true }, async (m, match) => {
  const [mode, ...rest] = match.trim().split(/\s+/)
  const usage = 'Usage : status on | off | no-dl | except-view <jid,…> | only-view <jid,…>\n_on = voir + sauvegarder dans votre chat · no-dl = voir seulement_'
  if (!mode) return m.reply(`${usage}\n\n*Actuel :* ${JSON.stringify(cfg('status', { mode: 'off' }))}`)
  if (['on', 'off', 'no-dl'].includes(mode)) db.set('global', 'status', { mode })
  else if (['except-view', 'only-view'].includes(mode) && rest.length) db.set('global', 'status', { mode, jids: csv(rest.join(' ')) })
  else return m.reply(usage)
  await m.reply('_Réglage des statuts mis à jour._')
})
bot({ on: 'status' }, async (raw, ctx) => {
  const s = cfg('status', null)
  if (!s || s.mode === 'off' || raw.key.fromMe) return
  const who = norm(raw.key.participant || raw.participant || '')
  if (s.mode === 'except-view' && s.jids.includes(who)) return
  if (s.mode === 'only-view' && !s.jids.includes(who)) return
  await ctx.sock.readMessages([raw.key]).catch(() => {})
  if (s.mode !== 'no-dl' && raw.message && !raw.message.protocolMessage && !raw.message.reactionMessage) {
    const dest = ownerJid()
    if (dest) {
      await ctx.sock.sendMessage(dest, { text: `📢 Statut de @${jidNum(who)}`, mentions: [who] }).catch(() => {})
      await ctx.sock.sendMessage(dest, { forward: raw }).catch(() => {})
    }
  }
})

// --- call : refus automatique des appels ------------------------------------------------------------
bot({ name: 'call', desc: 'Rejette automatiquement les appels (call on | off)', type: 'compte', owner: true }, async (m, match) => {
  if (!['on', 'off'].includes(match)) return m.reply(`Usage : call on | off\n*Actuel :* ${cfg('call', false) ? 'on' : 'off'}`)
  db.set('global', 'call', match === 'on')
  await m.reply(`_Rejet automatique des appels : ${match}_`)
})
bot({ on: 'call' }, async (calls, ctx) => {
  if (!cfg('call', false)) return
  for (const c of calls) {
    if (c.status !== 'offer') continue
    await ctx.sock.rejectCall(c.id, c.from).catch(() => {})
  }
})

// --- read : lecture automatique --------------------------------------------------------------------------
//   read on | off | p | g | jid,jid | ignore jid,jid     (combinables : read p 123@g.us · read g ignore 123@g.us)
bot({ name: 'read', desc: 'Lecture auto des messages (read on | off | p | g | jid | ignore jid)', type: 'compte', owner: true }, async (m, match) => {
  const usage = 'Usage : read on | off | p | g | jid,jid | ignore jid,jid\np = privés seulement, g = groupes seulement\nCombinable : read p 123@g.us · read g ignore 123@g.us'
  if (!match) return m.reply(`${usage}\n\n*Actuel :* ${JSON.stringify(cfg('read', 'off'))}`)
  if (match === 'off') db.set('global', 'read', null)
  else if (match === 'on') db.set('global', 'read', { all: true })
  else {
    const toks = match.split(/\s+/)
    const c = { p: false, g: false, jids: [], ignore: [] }
    let ig = false
    for (const t of toks) {
      if (t === 'p') c.p = true
      else if (t === 'g') c.g = true
      else if (t === 'ignore') ig = true
      else (ig ? c.ignore : c.jids).push(...csv(t))
    }
    if (!c.p && !c.g && !c.jids.length && !c.ignore.length) return m.reply(usage)
    if (c.ignore.length && !c.p && !c.g && !c.jids.length) c.all = true
    db.set('global', 'read', c)
  }
  await m.reply('_Lecture automatique mise à jour._')
})
bot({ on: 'message' }, async (m) => {
  const c = cfg('read', null)
  if (!c || m.fromMe || !m.raw.key.id) return
  if (c.ignore?.includes(m.jid)) return
  const ok = c.all || (c.p && !m.isGroup) || (c.g && m.isGroup) || c.jids?.includes(m.jid)
  if (ok) await m.sock.readMessages([m.raw.key]).catch(() => {})
})

// --- online : toujours « en ligne » --------------------------------------------------------------------------
bot({ name: 'online', desc: 'Reste toujours en ligne (online on | off)', type: 'compte', owner: true }, async (m, match) => {
  if (!['on', 'off'].includes(match)) return m.reply(`Usage : online on | off\n*Actuel :* ${cfg('online', false) ? 'on' : 'off'}`)
  db.set('global', 'online', match === 'on')
  await m.sock.sendPresenceUpdate(match === 'on' ? 'available' : 'unavailable').catch(() => {})
  await m.reply(`_Toujours en ligne : ${match}_`)
})
bot({ on: 'tick' }, async (sock) => {
  if (cfg('online', false)) await sock.sendPresenceUpdate('available').catch(() => {})
})

// --- contacts connus (pour « contact ») : ceux qui ont écrit en privé ---------------------------------------
const known = new Set(cfg('contacts', []))
bot({ on: 'message' }, async (m) => {
  if (m.isGroup || m.fromMe || !m.jid.endsWith('@s.whatsapp.net') || known.has(m.jid)) return
  known.add(m.jid)
  if (known.size > 3000) known.delete(known.values().next().value)
  db.set('global', 'contacts', [...known])
})

// --- setstatus / scstatus : publier un statut ---------------------------------------------------------------------
async function statusContent(m) {
  if (!m.quoted) return null
  const t = m.mediaType
  if (t === 'image' || t === 'video') {
    const buf = await m.downloadMedia()
    return { buf, type: t, caption: m.quoted.text || undefined }
  }
  return m.quoted.text ? { text: m.quoted.text } : null
}
const toContent = (s) => (s.buf ? { [s.type]: s.buf, caption: s.caption } : { text: s.text, backgroundColor: '#1f2c34', font: 2 })
const resolveTargets = (arg) => (arg.trim().toLowerCase() === 'contact' ? [...known] : csv(arg))

bot({ name: 'setstatus', desc: 'Publie un statut (répondre à un texte/image/vidéo : setstatus jid,jid | setstatus contact)', type: 'compte', owner: true }, async (m, match) => {
  if (!match) return m.reply('Exemple : setstatus jid,jid,… OU setstatus contact\n(en répondant à un texte, une image ou une vidéo)')
  const s = await statusContent(m)
  if (!s) return m.reply('Répondez à un message (texte, image ou vidéo) pour définir le statut.')
  const list = resolveTargets(match)
  if (!list.length) return m.reply('Aucun contact connu pour le moment.')
  await m.sock.sendMessage('status@broadcast', toContent(s), { statusJidList: list })
  await m.reply(`_Statut envoyé à ${list.length} contacts._`)
})

const SCH = () => cfg('status_schedule', [])
bot({ name: 'scstatus', desc: 'Programme un statut (scstatus jid,jid|min-heure-jour-mois · scstatus list)', type: 'compte', owner: true }, async (m, match) => {
  const usage = 'Exemples :\n- scstatus jid,jid|min-heure-jour-mois (jour et mois facultatifs)\n- scstatus contact|min-heure-jour-mois\n- scstatus delete all\n- scstatus list'
  if (!match) return m.reply(usage)
  if (match === 'list') {
    const l = SCH()
    return m.reply(l.length ? `Statuts programmés :\n${l.map((x, i) => `${i + 1}. ${schedule.show(x.at)} → ${x.targets === 'contact' ? 'contacts' : x.targets.length + ' JID'}`).join('\n')}` : 'Aucun statut programmé.')
  }
  if (/^delete all/i.test(match)) {
    db.set('global', 'status_schedule', [])
    return m.reply('Programmation supprimée.')
  }
  const [who, when] = match.split('|').map((s) => s.trim())
  const at = when && schedule.parse(when)
  if (!who || !at) return m.reply(`Format invalide.\n${usage}`)
  const s = await statusContent(m)
  if (!s) return m.reply('Répondez à un message (texte, image ou vidéo) pour programmer le statut.')
  if (s.buf && s.buf.length > 8 * 1024 * 1024) return m.reply('Média trop lourd pour être programmé (8 Mo max).')
  const entry = { at, targets: who.toLowerCase() === 'contact' ? 'contact' : csv(who), content: s.buf ? { ...s, buf: s.buf.toString('base64') } : s }
  db.set('global', 'status_schedule', [...SCH(), entry])
  await m.reply(`_Programmé pour le ${schedule.show(at)}._`)
})
bot({ on: 'tick' }, async (sock) => {
  const list = SCH()
  const due = list.filter((x) => x.at <= Date.now())
  if (!due.length) return
  db.set('global', 'status_schedule', list.filter((x) => x.at > Date.now()))
  for (const x of due) {
    const targets = x.targets === 'contact' ? [...known] : x.targets
    if (!targets.length) continue
    const s = x.content.buf ? { ...x.content, buf: Buffer.from(x.content.buf, 'base64') } : x.content
    await sock.sendMessage('status@broadcast', toContent(s), { statusJidList: targets }).catch(() => {})
  }
})

// --- gstatus : statut de groupe (expérimental : dépend de la version de WhatsApp) ----------------------------------
bot({ name: 'gstatus', desc: 'Statut de groupe (expérimental) : répondre à un texte/image/vidéo (gstatus ou gstatus jid-groupe)', type: 'groupe', owner: true }, async (m, match) => {
  const s = await statusContent(m)
  if (!s) return m.reply('Répondez à une image, une vidéo ou un texte avec : gstatus [jid-groupe]')
  const targets = match ? match.split(/[\s,]+/).filter((j) => j.endsWith('@g.us')) : m.isGroup ? [m.jid] : []
  if (!targets.length) return m.reply('Utilisez la commande dans un groupe ou donnez un JID de groupe.')
  for (const jid of targets) {
    try {
      const inner = await generateWAMessageContent(toContent(s), { upload: m.sock.waUploadToServer })
      const msg = generateWAMessageFromContent(jid, { groupStatusMessageV2: { message: inner } }, { userJid: m.sock.user.id })
      await m.sock.relayMessage(jid, msg.message, { messageId: msg.key.id })
      await m.reply(`_Statut de groupe publié dans ${jid}_`)
    } catch (e) {
      await m.reply(`❌ ${jid} : ${e.message}`)
    }
  }
})
