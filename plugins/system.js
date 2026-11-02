const { bot, db, find, store, utils, state } = require('../lib')
const { jidNum, norm, toJid, formatUptime } = utils

// --- afk -------------------------------------------------------------------------------
//   afk [raison] (#lastseen = durée d'absence) · afk off
const afk = () => db.get('global', 'afk', null)
const recentNotices = new Set()
const lastNotice = new Map() // chat -> ts

bot({ name: 'afk', desc: 'Mode absent (afk raison — #lastseen = durée) · afk off', type: 'compte', owner: true }, async (m, match) => {
  if (!match) return m.reply('> *Utilisation :*\n- afk <raison> (ex : afk Occupé, de retour dans #lastseen)\n- afk off\n_Envoyer un message désactive automatiquement le mode absent._')
  if (match.toLowerCase() === 'off') {
    db.del('global', 'afk')
    return m.reply('Bon retour ! Vous n\'êtes plus absent. 👋')
  }
  db.set('global', 'afk', { reason: match, since: Date.now() })
  await m.reply('_Mode absent activé._')
})

bot({ on: 'message' }, async (m, ctx) => {
  const a = afk()
  if (!a || !m.text && !m.mentioned.length) return
  if (m.fromMe || m.isOwner) {
    // Le propriétaire réécrit : fin du mode absent (hors commande et hors nos propres notices)
    if (m.text.startsWith(ctx.PREFIX) || recentNotices.has(m.text)) return
    db.del('global', 'afk')
    return m.reply('Bon retour ! Vous n\'êtes plus absent. 👋').catch(() => {})
  }
  const me = [m.sock.user?.id, m.sock.user?.lid].filter(Boolean).map(jidNum)
  const targeted = m.isGroup ? m.mentioned.some((j) => me.includes(jidNum(j))) || (m.quoted?.sender && me.includes(jidNum(m.quoted.sender))) : true
  if (!targeted || Date.now() - (lastNotice.get(m.jid) || 0) < 5 * 60_000) return
  lastNotice.set(m.jid, Date.now())
  const txt = a.reason.replace(/#lastseen/gi, formatUptime((Date.now() - a.since) / 1000))
  recentNotices.add(txt)
  setTimeout(() => recentNotices.delete(txt), 60_000)
  await m.reply(txt)
})

// --- clear : vide le chat -----------------------------------------------------------------
bot({ name: 'clear', desc: 'Vide la conversation (clear ou clear jid)', type: 'compte', owner: true }, async (m, match) => {
  const jid = match && /@/.test(match) ? match.trim() : m.jid
  await m.sock.chatModify({ delete: true, lastMessages: [{ key: m.key, messageTimestamp: m.raw.messageTimestamp }] }, jid)
  if (jid !== m.jid) await m.reply('_Conversation vidée._')
})

// --- setcmd / getcmd / delcmd : un sticker déclenche une commande -----------------------------
const cmds = () => db.get('global', 'stickercmds', {})
const shaOf = (message) => {
  const s = message?.stickerMessage
  return s?.fileSha256 ? Buffer.from(s.fileSha256).toString('base64') : null
}
bot({ name: 'setcmd', desc: 'Associe un sticker à une commande (répondre au sticker : setcmd ping)', type: 'compte', owner: true }, async (m, match) => {
  if (!m.quoted || m.mediaType !== 'sticker') return m.reply('*Répondez à un sticker.*')
  const name = match.split(/\s+/)[0]
  const c = name && find(name)
  if (!c) return m.reply(name ? `Commande inconnue : ${name}` : '*Exemple : setcmd ping* (en répondant à un sticker)')
  const sha = shaOf(m.quoted.message)
  if (!sha) return m.reply('_Échec_')
  db.set('global', 'stickercmds', { ...cmds(), [sha]: c.name })
  await m.reply('_Succès_')
})
bot({ name: 'getcmd', desc: 'Liste les commandes associées à des stickers', type: 'compte', owner: true }, async (m) => {
  const v = Object.values(cmds())
  await m.reply(v.length ? v.map((c, i) => `${i + 1}. ${c}`).join('\n') : '*Aucune commande associée.*')
})
bot({ name: 'delcmd', desc: 'Supprime l\'association d\'un sticker (répondre au sticker) ou d\'une commande (delcmd ping)', type: 'compte', owner: true }, async (m, match) => {
  const all = cmds()
  const sha = m.quoted && shaOf(m.quoted.message)
  const next = Object.fromEntries(Object.entries(all).filter(([k, v]) => (sha ? k !== sha : v !== match.trim())))
  if (!sha && !match) return m.reply('*Exemple :*\ndelcmd nomCommande\nou répondez à un sticker.')
  if (Object.keys(next).length === Object.keys(all).length) return m.reply('_Échec_')
  db.set('global', 'stickercmds', next)
  await m.reply('_Succès_')
})
bot({ on: 'message' }, async (m, ctx) => {
  if (m.type !== 'stickerMessage' || !(m.isOwner)) return
  const sha = shaOf(m.raw.message?.ephemeralMessage?.message || m.raw.message)
  const name = sha && cmds()[sha]
  const c = name && find(name)
  if (c) await c.handler(m, '', ctx)
})

// --- delete : anti-suppression ---------------------------------------------------------------
const SCOPES = ['pm', 'gm', 'no-pm', 'no-gm']
bot({ name: 'delete', desc: 'Anti-suppression : récupère les messages supprimés (delete g | p | jid | off)', type: 'whatsapp', owner: true }, async (m, match) => {
  const example = '> *Exemples :*\n- delete g — dans le même chat\n- delete p — au propriétaire\n- delete g pm | gm — même chat, privé / groupes seulement\n- delete p no-gm | no-pm — exclure groupes / privés\n- delete <jid> — vers un JID précis\n- delete off — désactiver'
  const [dest = '', scope = ''] = match.trim().split(/\s+/)
  if (dest === 'off') {
    db.del('global', 'antidelete')
    return m.reply('Anti-suppression désactivé.')
  }
  const isJid = /@(s\.whatsapp\.net|g\.us)$/.test(dest) || /^\d{7,}$/.test(dest)
  if (!['g', 'p'].includes(dest) && !isJid) return m.reply(example)
  if (scope && !SCOPES.includes(scope.toLowerCase())) return m.reply(example)
  db.set('global', 'antidelete', { dest: isJid && !dest.includes('@') ? toJid(dest) : dest, scope: scope.toLowerCase() })
  await m.reply('_Anti-suppression activé._')
})
bot({ on: 'message' }, async (m) => {
  const cfg = db.get('global', 'antidelete', null)
  const proto = m.raw.message?.protocolMessage
  if (!cfg || m.fromMe || proto?.type !== 0 || !proto.key?.id) return
  if ((cfg.scope === 'pm' || cfg.scope === 'no-gm') === m.isGroup && cfg.scope) return
  if ((cfg.scope === 'gm' || cfg.scope === 'no-pm') && !m.isGroup) return
  const orig = store.get(m.jid, proto.key.id)
  if (!orig?.message || orig.key.fromMe) return
  const dest = cfg.dest === 'g' ? m.jid : cfg.dest === 'p' ? state.user : cfg.dest
  if (!dest) return
  const who = norm(orig.key.participant || orig.key.remoteJid)
  await m.sock.sendMessage(dest, { text: `🗑️ *Message supprimé*\n*Par :* @${jidNum(who)}\n*Chat :* ${m.isGroup ? m.jid : '@' + jidNum(m.jid)}`, mentions: [who] })
  await m.sock.sendMessage(dest, { forward: orig }).catch(() => {})
})

// --- dlt · forward · save · react ----------------------------------------------------------------
bot({ name: 'dlt', desc: 'Supprime le message cité', type: 'compte' }, async (m) => {
  if (!m.quoted) return m.reply('Répondez au message à supprimer.')
  await m.sock.sendMessage(m.jid, { delete: { remoteJid: m.jid, id: m.quoted.key.id, fromMe: m.quoted.key.fromMe, participant: m.quoted.key.participant } })
})

const quotedRaw = (m) => ({ key: m.quoted.key, message: m.quoted.message })
bot({ name: 'forward', desc: 'Transfère le message cité (forward jid, jid…)', type: 'compte', owner: true }, async (m, match) => {
  const targets = match.split(/[\s,]+/).filter(Boolean).map((j) => (j.includes('@') ? j : toJid(j))).filter(Boolean)
  if (!m.quoted || !targets.length) return m.reply('*Utilisation :* répondez à un message avec\n- forward <jid>\n- forward 2250700000000@s.whatsapp.net')
  for (const t of targets) {
    await m.sock.sendMessage(t, { forward: quotedRaw(m) })
    await m.reply(`Message envoyé à : ${t} ✅`)
  }
})
bot({ name: 'save', desc: 'Enregistre le message cité dans votre propre chat', type: 'compte', owner: true }, async (m) => {
  if (!m.quoted) return m.reply('Répondez à un message.')
  await m.sock.sendMessage(norm(m.sock.user.id), { forward: quotedRaw(m) })
  await m.reply('Message enregistré 🔒')
})
bot({ name: 'react', desc: 'Réagit au message cité (react ❣)', type: 'compte', owner: true }, async (m, match) => {
  if (!m.quoted || !match) return m.reply('_Exemple : react ❣_ (en répondant à un message)')
  await m.sock.sendMessage(m.jid, { react: { text: match.trim(), key: m.quoted.key } })
})

// --- chaînes WhatsApp ------------------------------------------------------------------------------
const channelCode = (u) => u.match(/whatsapp\.com\/channel\/([\w-]+)(?:\/(\d+))?/i)
bot({ name: 'creact', desc: 'Réagit à un post de chaîne (creact lien-du-post, ❣)', type: 'compte', owner: true }, async (m, match) => {
  const [link, emoji] = match.split(',').map((s) => s.trim())
  const c = link && channelCode(link)
  if (!c || !c[2] || !emoji) return m.reply('_Exemple : creact https://whatsapp.com/channel/xxx/123, ❣_')
  const meta = await m.sock.newsletterMetadata('invite', c[1]).catch(() => null)
  if (!meta) return m.reply('_Chaîne introuvable_')
  await m.sock.newsletterReactMessage(meta.id, c[2], emoji)
  await m.reply('_Réaction envoyée_')
})
bot({ name: 'cinfo', desc: 'Infos d\'une chaîne WhatsApp (cinfo lien)', type: 'compte' }, async (m, match) => {
  const c = match && channelCode(match)
  if (!c) return m.reply('_Exemple : cinfo https://whatsapp.com/channel/xxx_')
  const meta = await m.sock.newsletterMetadata('invite', c[1]).catch(() => null)
  if (!meta) return m.reply('_Impossible de récupérer la chaîne_')
  await m.reply(`*Nom :* ${meta.name}\n*JID :* ${meta.id}\n*Abonnés :* ${meta.subscribers ?? '—'}\n*Créée :* ${meta.creation_time ? new Date(meta.creation_time * 1000).toLocaleDateString('fr-FR') : '—'}\n*Description :* ${meta.description || '—'}`)
})

// --- ison : numéros présents sur WhatsApp ------------------------------------------------------------
bot({ name: 'ison', desc: 'Vérifie si des numéros sont sur WhatsApp (ison 2250700000000, …)', type: 'outils' }, async (m, match) => {
  const nums = [...new Set(match.split(/[\s,]+/).map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 7))].slice(0, 30)
  if (!nums.length) return m.reply('Exemple : ison 2250700000000 (plusieurs numéros séparés par des virgules)')
  const res = await m.sock.onWhatsApp(...nums.map((n) => `${n}@s.whatsapp.net`))
  const ok = new Set((res || []).filter((r) => r.exists).map((r) => jidNum(r.jid)))
  const yes = nums.filter((n) => ok.has(n))
  const no = nums.filter((n) => !ok.has(n))
  await m.reply([yes.length && `*Présents sur WhatsApp* (${yes.length})\n${yes.map((n) => '+' + n).join('\n')}`, no.length && `*Absents de WhatsApp* (${no.length})\n${no.map((n) => '+' + n).join('\n')}`].filter(Boolean).join('\n\n'))
})
