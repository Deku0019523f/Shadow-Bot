const sharp = require('sharp')
const { bot, utils } = require('../lib')
const { jidNum } = utils

// Profil, compte et photo de profil du bot
const target = (m, match) => m.target(match) || null
const jidOf = (m, match) => m.mentioned[0] || m.quoted?.sender || (/@/.test(match) ? match.trim() : null) || m.jid

bot({ name: 'jid', desc: 'JID du chat, du membre mentionné ou de la personne citée', type: 'compte' }, (m, match) => m.reply(jidOf(m, match)))

bot({ name: 'left', desc: 'Le bot quitte le groupe (left message d\'adieu)', type: 'compte', onlyGroup: true, owner: true }, async (m, match) => {
  if (match) await m.send(match)
  await m.sock.groupLeave(m.jid)
})

bot({ name: 'block', desc: 'Bloque un contact', type: 'compte', owner: true }, async (m, match) => {
  const id = target(m, match) || (!m.isGroup ? m.jid : null)
  if (!id) return m.reply('Répondez à un message, mentionnez quelqu\'un ou utilisez la commande en privé.')
  await m.reply('_Blocage…_')
  await m.sock.updateBlockStatus(id, 'block')
})

bot({ name: 'unblock', desc: 'Débloque un contact', type: 'compte', owner: true }, async (m, match) => {
  const id = target(m, match) || (!m.isGroup ? m.jid : null)
  if (!id) return m.reply('Répondez à un message, mentionnez quelqu\'un ou utilisez la commande en privé.')
  await m.sock.updateBlockStatus(id, 'unblock')
  await m.reply('_Débloqué_')
})

async function setPicture(m, full) {
  if (m.mediaType !== 'image' || !m.quoted) return m.reply('Répondez à une image.')
  let buf = await m.downloadMedia()
  if (full) {
    // image entière sur fond flouté carré (pas de recadrage)
    const meta = await sharp(buf).metadata()
    const side = Math.max(meta.width, meta.height)
    const bg = await sharp(buf).resize(side, side, { fit: 'cover' }).blur(30).toBuffer()
    buf = await sharp(bg).composite([{ input: await sharp(buf).toBuffer(), gravity: 'centre' }]).jpeg({ quality: 90 }).toBuffer()
  }
  await m.sock.updateProfilePicture(m.sock.user.id, buf)
  await m.reply('_Photo de profil mise à jour_')
}
bot({ name: 'pp', desc: 'Change la photo de profil du bot (répondre à une image)', type: 'compte', owner: true }, (m) => setPicture(m, false))
bot({ name: 'fullpp', desc: 'Photo de profil sans recadrage (répondre à une image)', type: 'compte', owner: true }, (m) => setPicture(m, true))

bot({ name: 'whois', desc: 'Infos sur un membre ou un groupe (whois @membre | whois jid-groupe)', type: 'divers' }, async (m, match) => {
  const arg = match.trim()
  const gid = arg.endsWith('@g.us') ? arg : !m.mentioned[0] && !m.quoted && !arg && m.isGroup ? m.jid : null
  const id = gid ? null : target(m, match) || (!m.isGroup ? m.jid : null)
  if (!gid && !id) return m.reply('Exemple : whois @membre (ou en répondant à un message)')
  let pp = null
  try { pp = await m.sock.profilePictureUrl(gid || id, 'image') } catch {}
  let caption
  if (gid) {
    const meta = await m.sock.groupMetadata(gid)
    caption = `*Nom :* ${meta.subject}\n*Créateur :* ${meta.owner ? '+' + jidNum(meta.ownerPn || meta.owner) : '—'}\n*Membres :* ${meta.participants.length}\n*Créé le :* ${new Date(meta.creation * 1000).toLocaleDateString('fr-FR')}\n*Description :* ${meta.desc || '—'}`
  } else {
    caption = `*Numéro :* +${jidNum(id)}`
    try {
      const [res] = (await m.sock.fetchStatus(id)) || []
      if (res?.status) caption += `\n*À propos :* ${res.status.status || res.status}\n*Depuis :* ${res.setAt ? new Date(res.setAt).toLocaleDateString('fr-FR') : '—'}`
    } catch {}
  }
  if (!pp) return m.reply(caption)
  await m.sendMedia(pp, { type: 'image', caption })
})

bot({ name: 'gjid', desc: 'Liste des groupes du bot avec leurs JID', type: 'compte', owner: true }, async (m) => {
  const all = await m.sock.groupFetchAllParticipating()
  const rows = Object.values(all)
  if (!rows.length) return m.reply('Aucun groupe.')
  await m.reply(rows.map((g, i) => `*${i + 1}.* ${g.subject}\n${g.id}`).join('\n\n'))
})
