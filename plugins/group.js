const { bot, db, utils, groups } = require('../lib')
const { norm, sleep, jidNum } = utils

const mention = (jid) => `@${jidNum(jid)}`
const adminIn = (meta, jid) => !!groups.adminLevel(meta, [norm(jid)])
const botIds = (sock) => [sock.user?.id, sock.user?.lid].filter(Boolean).map(norm)
const INVITE_RE = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i
const GJID_RE = /\d+(?:-\d+)?@g\.us/g

// Cibles d'une commande : mentions, sinon message cité
const targets = (m) => (m.mentioned.length ? m.mentioned : m.quoted?.sender ? [m.quoted.sender] : [])

bot(
  { name: 'kick', desc: 'Expulse des membres (mention/réponse) — "kick all" expulse tous les non-admins', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m, match, ctx) => {
    const meta = ctx.group.meta
    const me = botIds(m.sock)
    let users
    if (match.toLowerCase() === 'all') {
      users = meta.participants.filter((p) => !p.admin && !me.includes(norm(p.id))).map((p) => p.id)
    } else {
      users = targets(m).filter((u) => !adminIn(meta, u) && !me.includes(norm(u)))
    }
    if (!users.length) return m.reply('Mentionnez un membre (non-admin) ou répondez à son message.')

    if (match.toLowerCase() === 'all') {
      await m.reply(`⚠️ Expulsion de ${users.length} membres dans 10 secondes…`)
      await sleep(10_000)
    }
    for (let i = 0; i < users.length; i += 20) {
      await m.sock.groupParticipantsUpdate(m.jid, users.slice(i, i + 20), 'remove')
    }
    if (m.quoted && match.toLowerCase() !== 'all') {
      await sleep(3000)
      await m.deleteMessage(m.quoted.key).catch(() => {})
    }
    if (match.toLowerCase() !== 'all') await m.send(`👢 ${users.map(mention).join(', ')} expulsé(s).`, { mentions: users })
  }
)

bot(
  { name: 'add', desc: 'Ajoute des numéros au groupe (ex: add 2250700000000)', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m, match) => {
    const nums = match.split(/[\s,]+/).map((x) => x.replace(/\D/g, '')).filter((x) => x.length >= 7)
    if (m.quoted?.sender && !nums.length) nums.push(jidNum(m.quoted.sender))
    if (!nums.length) return m.reply('Donnez un ou plusieurs numéros au format international.\nExemple : add 2250700000000')
    await m.reply('⏳ Ajout en cours… (WhatsApp limite les ajouts pour éviter les abus)')
    const res = await m.sock.groupParticipantsUpdate(m.jid, nums.map((n) => `${n}@s.whatsapp.net`), 'add')
    const text = res.map((r) => {
      const who = `+${jidNum(r.jid)}`
      if (String(r.status) === '200') return `✅ ${who} ajouté`
      if (String(r.status) === '409') return `ℹ️ ${who} est déjà dans le groupe`
      if (String(r.status) === '403') return `🔒 ${who} n'autorise pas les ajouts (envoyez-lui le lien avec .link)`
      if (String(r.status) === '408') return `⚠️ ${who} a quitté récemment le groupe`
      return `❌ ${who} : échec (code ${r.status})`
    })
    await m.send(text.join('\n'))
  }
)

bot(
  { name: 'promote', desc: 'Nomme des membres admins', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m, match, ctx) => {
    const users = targets(m).filter((u) => !adminIn(ctx.group.meta, u))
    if (!users.length) return m.reply('Mentionnez un membre (non-admin) ou répondez à son message.')
    await m.sock.groupParticipantsUpdate(m.jid, users, 'promote')
    await m.send(`⬆️ ${users.map(mention).join(', ')} est/sont maintenant admin.`, { mentions: users })
  }
)

bot(
  { name: 'demote', desc: 'Retire le statut admin', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m, match, ctx) => {
    const users = targets(m).filter((u) => adminIn(ctx.group.meta, u))
    if (!users.length) return m.reply("Mentionnez un admin ou répondez à son message (la cible n'est pas admin).")
    await m.sock.groupParticipantsUpdate(m.jid, users, 'demote')
    await m.send(`⬇️ ${users.map(mention).join(', ')} n'est/ne sont plus admin.`, { mentions: users })
  }
)

bot(
  { name: 'tagall', desc: 'Mentionne tous les membres', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match, ctx) => {
    const ids = ctx.group.meta.participants.map((p) => p.id)
    await m.send(`📢 ${match || 'Attention tout le monde !'}\n\n${ids.map((id) => `• ${mention(id)}`).join('\n')}`, { mentions: ids })
  }
)

bot(
  { name: 'hidetag', desc: 'Notifie tout le monde sans afficher les mentions', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match, ctx) => {
    await m.send(match || '📢', { mentions: ctx.group.meta.participants.map((p) => p.id) })
  }
)

bot(
  { name: 'link', aliases: ['invite'], desc: "Donne le lien d'invitation du groupe", type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m) => {
    const code = await m.sock.groupInviteCode(m.jid)
    await m.reply(`🔗 https://chat.whatsapp.com/${code}`)
  }
)

bot(
  { name: 'revoke', desc: "Réinitialise le lien d'invitation du groupe", type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m) => {
    await m.sock.groupRevokeInvite(m.jid)
    await m.reply("♻️ Le lien d'invitation a été réinitialisé. Utilisez .link pour obtenir le nouveau.")
  }
)

bot(
  { name: 'close', desc: 'Seuls les admins peuvent écrire', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m) => {
    await m.sock.groupSettingUpdate(m.jid, 'announcement')
    await m.reply('🔒 Groupe fermé : seuls les admins peuvent écrire.')
  }
)

bot(
  { name: 'open', desc: 'Tout le monde peut écrire', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m) => {
    await m.sock.groupSettingUpdate(m.jid, 'not_announcement')
    await m.reply('🔓 Groupe ouvert : tout le monde peut écrire.')
  }
)

// mute [minutes] : ferme le groupe, avec réouverture automatique optionnelle
bot(
  { name: 'mute', desc: 'Ferme le groupe (mute 30 = pendant 30 minutes)', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m, match) => {
    await m.sock.groupSettingUpdate(m.jid, 'announcement')
    const min = Number(match)
    if (match && Number.isFinite(min) && min > 0) {
      db.set(`group:${m.jid}`, 'unmuteAt', Date.now() + min * 60_000)
      return m.reply(`🔇 Groupe en sourdine pendant ${min} minute(s).`)
    }
    await m.reply('🔇 Groupe fermé : seuls les admins peuvent écrire.')
  }
)

bot(
  { name: 'unmute', desc: 'Rouvre le groupe', type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
  async (m) => {
    db.del(`group:${m.jid}`, 'unmuteAt')
    await m.sock.groupSettingUpdate(m.jid, 'not_announcement')
    await m.reply('🔊 Groupe rouvert : tout le monde peut écrire.')
  }
)

// Réouverture automatique après "mute <minutes>" (survit aux redémarrages)
bot({ on: 'tick' }, async (sock) => {
  for (const scope of db.scopes('group:')) {
    const at = db.get(scope, 'unmuteAt')
    if (!at || at > Date.now()) continue
    db.del(scope, 'unmuteAt')
    await sock.groupSettingUpdate(scope.slice('group:'.length), 'not_announcement').catch(() => {})
  }
})

bot(
  { name: 'join', desc: 'Fait rejoindre un groupe au bot via un lien (propriétaire)', type: 'groupe', owner: true },
  async (m, match) => {
    const code = (match || m.quoted?.text || '').match(INVITE_RE)?.[1]
    if (!code) return m.reply("Lien d'invitation invalide.\nExemple : join https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXXXX")
    const info = await m.sock.groupGetInviteInfo(code).catch(() => null)
    if (!info) return m.reply("Lien invalide ou expiré.")
    if (info.size > 1024) return m.reply('Ce groupe est complet.')
    try {
      await m.sock.groupAcceptInvite(code)
      await m.reply(`✅ J'ai rejoint *${info.subject}*.`)
    } catch (err) {
      await m.reply(/approv|request|membership/i.test(String(err.message)) ? '📨 Demande d\'adhésion envoyée (approbation requise).' : '❌ Impossible de rejoindre ce groupe.')
    }
  }
)

bot(
  { name: 'ginfo', desc: "Infos d'un groupe à partir de son lien d'invitation", type: 'groupe' },
  async (m, match) => {
    const code = (match || m.quoted?.text || '').match(INVITE_RE)?.[1]
    if (!code) return m.reply('Donnez un lien d\'invitation.\nExemple : ginfo https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXX')
    const i = await m.sock.groupGetInviteInfo(code).catch(() => null)
    if (!i) return m.reply('Lien invalide ou expiré.')
    const created = i.creation ? new Date(i.creation * 1000).toLocaleDateString('fr-FR') : '—'
    await m.reply(
      `*Nom :* ${i.subject}\n*ID :* ${i.id}\n*Créé par :* +${jidNum(i.owner || i.subjectOwner || '')}\n*Membres :* ${i.size}\n*Création :* ${created}\n*Description :* ${i.desc || '—'}`
    )
  }
)

// common <jid-groupe> [jid-groupe…] [any] [kick|kickall] [skip [jid…]]
bot(
  { name: 'common', desc: 'Membres communs à plusieurs groupes (kick / kickall / any / skip)', type: 'groupe', onlyGroup: true, admin: true },
  async (m, match) => {
    const usage =
      '*Utilisation :*\n• common <jid-groupe> — membres communs avec ce groupe\n• common <jid1> <jid2> — communs à tous ces groupes\n• … any — présents dans au moins 2 groupes\n• … kick — expulse du groupe actuel\n• … kickall — expulse de tous les groupes listés\n• … kickall skip <jid> — en épargnant certains groupes (sans jid : garde chacun dans le 1er groupe où il apparaît)\n\n_Le bot doit être membre (et admin pour expulser) de chaque groupe._'
    const kick = /\bkick\b/i.test(match)
    const kickAll = /\bkickall\b/i.test(match)
    const any = /\bany\b/i.test(match)
    const hasSkip = /\bskip\b/i.test(match)
    const toSkip = (match.split(/\bskip\b/i)[1] || '').match(GJID_RE) || []
    const anySkip = hasSkip && !toSkip.length
    const jids = [...new Set(match.match(GJID_RE) || [])]
    if (!jids.length) return m.reply(usage)
    if (!jids.includes(m.jid)) jids.push(m.jid)
    if (jids.length < 2) return m.reply(usage)

    const metas = {}
    for (const jid of jids) {
      try {
        metas[jid] = await m.sock.groupMetadata(jid)
      } catch {
        return m.reply(`❌ Je ne peux pas lire le groupe ${jid} (je dois en être membre).`)
      }
    }
    const members = Object.fromEntries(
      jids.map((j) => [j, new Set(metas[j].participants.filter((p) => !p.admin).map((p) => norm(p.id)))])
    )
    const count = new Map()
    for (const j of jids) for (const id of members[j]) count.set(id, (count.get(id) || 0) + 1)
    const common = [...count].filter(([, n]) => (any ? n >= 2 : n === jids.length)).map(([id]) => id)
    if (!common.length) return m.reply('Aucun membre commun trouvé.')

    const me = botIds(m.sock)
    const kickFrom = async (jid, ids) => {
      const meta = metas[jid]
      if (!groups.adminLevel(meta, me)) return
      const present = ids.filter((id) => meta.participants.some((p) => !p.admin && norm(p.id) === id))
      for (let i = 0; i < present.length; i += 20) await m.sock.groupParticipantsUpdate(jid, present.slice(i, i + 20), 'remove').catch(() => {})
    }

    if (kickAll) {
      const seen = new Set()
      for (const jid of jids.filter((j) => anySkip || !toSkip.includes(j))) {
        if (anySkip) {
          const ids = common.filter((id) => members[jid].has(id) && seen.has(id))
          common.filter((id) => members[jid].has(id)).forEach((id) => seen.add(id))
          await kickFrom(jid, ids)
        } else await kickFrom(jid, common)
      }
      return m.reply(`👢 Expulsion lancée pour ${common.length} membre(s) commun(s).`)
    }
    if (kick) {
      if (!m.isOwner && !(await m.groupInfo()).isBotAdmin) return m.reply('⚠️ Je dois être admin du groupe.')
      await kickFrom(m.jid, common)
      return m.reply(`👢 ${common.length} membre(s) commun(s) expulsé(s).`)
    }
    await m.send(`*${common.length} membre(s) commun(s) :*\n` + common.map((id, i) => `${i + 1}. ${mention(id)}`).join('\n'), { mentions: common })
  }
)
