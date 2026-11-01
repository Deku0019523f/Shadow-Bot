const { extractMessageContent } = require('@whiskeysockets/baileys')
const { bot, db, store, utils } = require('../lib')
const { jidNum, norm } = utils

// Anti-edit : suit les messages modifiés et envoie « avant / après ».
//   antiedit g            -> dans le même chat          antiedit p -> au propriétaire (chat privé du bot)
//   antiedit <jid>        -> vers un JID précis         antiedit off
//   + portée : pm | gm | no-pm | no-gm
const SCOPES = ['pm', 'gm', 'no-pm', 'no-gm']
const get = () => db.get('global', 'antiedit', null)

bot(
  { name: 'antiedit', desc: "Anti-edit : affiche l'historique des messages modifiés (g | p | jid | off)", type: 'whatsapp', owner: true },
  async (m, match) => {
    const example =
      '> *Exemples :*\n- antiedit g — envoyer dans le même chat\n- antiedit p — envoyer au propriétaire\n- antiedit g pm — même chat, privé seulement\n- antiedit g gm — même chat, groupes seulement\n- antiedit p no-gm — au propriétaire, sans les groupes\n- antiedit p no-pm — au propriétaire, sans les privés\n- antiedit <jid> — vers un JID précis\n- antiedit off — désactiver\n\n*Portées :* pm, gm, no-pm, no-gm'
    const [dest = '', scope = ''] = match.trim().split(/\s+/)
    const off = dest === 'off' || dest === 'false'
    const isJid = /@(s\.whatsapp\.net|g\.us)$/.test(dest) || /^\d{7,}$/.test(dest)
    if (!dest || (!['g', 'p'].includes(dest) && !off && !isJid)) return m.reply(example)
    if (scope && !SCOPES.includes(scope.toLowerCase())) return m.reply(example)

    if (off) {
      db.del('global', 'antiedit')
      return m.reply("Anti-edit a été désactivé.")
    }
    const target = isJid && !dest.includes('@') ? `${dest}@s.whatsapp.net` : dest
    db.set('global', 'antiedit', { dest: target, scope: scope.toLowerCase() })
    const where = isJid ? `_L'historique sera envoyé à : ${target}_` : dest === 'p' ? "_L'historique sera envoyé au propriétaire._" : "_L'historique sera envoyé dans le chat lui-même._"
    const scopeText = { pm: '\n📌 _Chats privés uniquement_', gm: '\n📌 _Groupes uniquement_', 'no-pm': '\n📌 _Hors chats privés_', 'no-gm': '\n📌 _Hors groupes_' }[scope.toLowerCase()] || ''
    await m.reply(where + scopeText)
  }
)

// Retrouve le protocolMessage d'édition dans les enveloppes éventuelles
function findEdit(msg) {
  let x = msg
  for (let i = 0; i < 4 && x; i++) {
    if (x.protocolMessage?.editedMessage) return x.protocolMessage
    x = x.editedMessage?.message || x.ephemeralMessage?.message || x.viewOnceMessage?.message || null
  }
  return null
}

const textOf = (message) => {
  const c = extractMessageContent(message)
  return c?.conversation || c?.extendedTextMessage?.text || c?.imageMessage?.caption || c?.videoMessage?.caption || ''
}

const latest = new Map() // id du message -> dernier texte connu (chaîne d'éditions)

bot({ on: 'message' }, async (m) => {
  // On mémorise le texte de chaque message pour pouvoir comparer plus tard
  if (m.text && m.id) {
    latest.set(m.id, m.text)
    if (latest.size > 3000) latest.delete(latest.keys().next().value)
  }
  const cfg = get()
  if (!cfg || m.fromMe) return
  const edit = findEdit(m.raw.message)
  if (!edit) return

  if (cfg.scope === 'pm' && m.isGroup) return
  if (cfg.scope === 'gm' && !m.isGroup) return
  if (cfg.scope === 'no-pm' && !m.isGroup) return
  if (cfg.scope === 'no-gm' && m.isGroup) return

  const origId = edit.key?.id
  const before = latest.get(origId) ?? (store.get(m.jid, origId)?.message ? textOf(store.get(m.jid, origId).message) : '')
  const after = textOf(edit.editedMessage)
  if (!after || before === after) return
  latest.set(origId, after)

  const dest = cfg.dest === 'g' ? m.jid : cfg.dest === 'p' ? norm(m.sock.user.id) : cfg.dest
  const where = m.isGroup ? ` dans le groupe` : ''
  await m.sock.sendMessage(dest, {
    text: `✏️ *Message modifié* par @${jidNum(m.sender)}${where}\n\n*Avant :* ${before || '(inconnu)'}\n*Après :* ${after}`,
    mentions: [m.sender],
  })
})
