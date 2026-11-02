const { bot, config, utils } = require('../lib')
const { sendWithLogo } = require('../lib/branding')

bot({ name: 'ping', desc: 'Mesure la latence du bot', type: 'général' }, async (m) => {
  const t = Date.now()
  const sent = await m.reply('🏓 Ping...')
  await m.sock.sendMessage(m.jid, { text: `🏓 Pong ! ${Date.now() - t} ms`, edit: sent.key })
})

bot({ name: 'alive', desc: 'Vérifie que le bot fonctionne', type: 'général' }, async (m) => {
  await m.reply(
    [
      `✅ *${config.BOT_NAME}* est en ligne`,
      `• Version : ${config.VERSION}`,
      `• Uptime : ${utils.formatUptime(process.uptime())}`,
      `• Mémoire : ${utils.ramUsage()}`,
    ].join('\n')
  )
})

const LABELS = {
  'général': ['ℹ️', 'Général'], bot: ['🤖', 'Bot'], groupe: ['👥', 'Groupe'], compte: ['👤', 'Compte WhatsApp'],
  image: ['🖼️', 'Images'], images: ['🖼️', 'Images'], 'vidéo': ['🎬', 'Vidéo'], video: ['🎬', 'Vidéo'],
  audio: ['🎧', 'Audio'], sticker: ['✨', 'Stickers'], document: ['📄', 'Documents'],
  'téléchargement': ['📥', 'Téléchargements'], recherche: ['🔎', 'Recherche'], outils: ['🧰', 'Outils'],
  ia: ['🧠', 'Intelligence artificielle'], logia: ['🧠', 'Intelligence artificielle'], jeux: ['🎮', 'Jeux'],
  'réponses auto': ['💬', 'Réponses automatiques'], perso: ['🎛️', 'Personnalisation'], organisation: ['🗓️', 'Organisation'],
  budget: ['💰', 'Budget'], whatsapp: ['📱', 'WhatsApp'], divers: ['📦', 'Divers'],
}
const labelOf = (t) => LABELS[t] || ['▫️', t.charAt(0).toUpperCase() + t.slice(1)]
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

bot({ name: 'menu', aliases: ['help', 'aide'], desc: 'Affiche la liste des commandes (menu <catégorie>)', type: 'général' }, async (m, match, ctx) => {
  const disabled = ctx.db.get('global', 'disabled', [])
  const visible = ctx.commands.filter((c) => !c.hidden && (!c.platform || m.isOperator))

  // Regroupe les types équivalents (image/images, video/vidéo…) sous un même libellé
  const groups = new Map()
  for (const c of visible) {
    const [icon, label] = labelOf(c.type)
    if (!groups.has(label)) groups.set(label, { icon, label, cmds: [] })
    groups.get(label).cmds.push(c)
  }
  const all = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))

  const wanted = norm(match.trim())
  const picked = wanted ? all.filter((g) => norm(g.label).includes(wanted)) : all
  if (wanted && !picked.length) {
    return m.reply(`Catégorie introuvable : *${match.trim()}*\n\n*Catégories disponibles*\n${all.map((g) => `• ${g.icon} ${g.label}`).join('\n')}`)
  }

  const mode = ctx.db.get('global', 'mode', config.MODE) === 'private' ? 'Privé' : 'Public'
  const header = [
    `╭━━━━〔 *${config.BOT_NAME.toUpperCase()}* 〕━━━━╮`,
    `┃ *Utilisateur* : ${m.pushName || 'Inconnu'}`,
    `┃ *Préfixe* : ${ctx.PREFIX}`,
    `┃ *Mode* : ${mode}`,
    `┃ *Commandes* : ${visible.length}`,
    `┃ *Version* : ${config.VERSION}`,
    `┃ *Disponibilité* : ${utils.formatUptime(process.uptime())}`,
    `╰━━━━━━━━━━━━━━━━━━━╯`,
  ].join('\n')

  const blocks = picked.map((g) => {
    const lines = g.cmds
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => {
        const flags = `${c.owner ? ' 🔒' : ''}${disabled.includes(c.name) ? ' _(désactivée)_' : ''}`
        return `│ ▸ *${ctx.PREFIX}${c.name}*${flags}${c.desc ? `\n│    _${c.desc}_` : ''}`
      })
    return `╭─〔 ${g.icon} *${g.label.toUpperCase()}* · ${g.cmds.length} 〕\n${lines.join('\n')}\n╰──────────────`
  })

  const footer = wanted
    ? `_${ctx.PREFIX}menu pour revenir à toutes les catégories._`
    : `*Astuces*\n• *${ctx.PREFIX}menu <catégorie>* — afficher une seule catégorie\n• 🔒 — commande réservée au propriétaire\n• *${ctx.PREFIX}list* — liste compacte`

  if (!wanted) {
    const summary = all.map((g) => `${g.icon} ${g.label} — *${g.cmds.length}*`).join('\n')
    await sendWithLogo(m.sock, m.jid, `${header}\n\n*📚 Catégories*\n${summary}`, { quoted: m.raw })
    // Découpe en messages de taille raisonnable (≈ 3500 caractères)
    const chunks = ['']
    for (const b of blocks) {
      if (chunks.at(-1) && chunks.at(-1).length + b.length > 3500) chunks.push('')
      chunks[chunks.length - 1] += (chunks.at(-1) ? '\n\n' : '') + b
    }
    for (const c of chunks) await m.send(c)
    return m.send(footer)
  }
  await m.reply(`${header}\n\n${blocks.join('\n\n')}\n\n${footer}`)
})

bot({ name: 'list', desc: 'Liste compacte de toutes les commandes', type: 'général' }, async (m, match, ctx) => {
  const names = ctx.commands.filter((c) => !c.hidden && (!c.platform || m.isOperator)).map((c) => c.name).sort()
  await m.reply(`*${names.length} commandes*\n\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`)
})
