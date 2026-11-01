const db = require('./db')
const { fill } = require('./utils')

const scope = (jid) => `group:${jid}`

// Variables d'exécution modifiables avec la commande setvar (db global/vars)
const vars = () => db.get('global', 'vars', {})

const getWarnLimit = (groupJid) => {
  const n = Number(db.get(scope(groupJid), 'warnlimit', null) ?? vars().WARN_LIMIT ?? process.env.WARN_LIMIT ?? 3)
  return Number.isFinite(n) && n >= 0 ? n : 3
}
const getWarns = (groupJid, user) => db.get(scope(groupJid), `warn:${user}`, 0)
const resetWarns = (groupJid, user) => db.del(scope(groupJid), `warn:${user}`)

// Gabarits de messages (&mention, &remaining, &warn, &reason) — surchargeables via setvar
const TEMPLATES = {
  WARN_MESSAGE: '⚠️ *AVERTISSEMENT* ⚠️\n\n*Utilisateur :* &mention\n*Raison :* &reason\n*Avertissements restants :* &remaining/&warn',
  WARN_RESET_MESSAGE: '♻️ Avertissements de &mention réinitialisés (limite : &warn).',
  WARN_KICK_MESSAGE: '🚫 &mention a été expulsé : limite d\'avertissements dépassée.',
}
const template = (name, v) => fill(vars()[name] || TEMPLATES[name], v)

// Ajoute un avertissement. Retourne { count, limit, remaining, kicked }.
// Au-delà de la limite, l'utilisateur est expulsé (le bot doit être admin ; l'appelant vérifie).
async function addWarn(sock, groupJid, user) {
  const limit = getWarnLimit(groupJid)
  const count = getWarns(groupJid, user) + 1
  if (count > limit) {
    resetWarns(groupJid, user)
    await sock.groupParticipantsUpdate(groupJid, [user], 'remove')
    return { count, limit, remaining: 0, kicked: true }
  }
  db.set(scope(groupJid), `warn:${user}`, count)
  return { count, limit, remaining: limit - count, kicked: false }
}

module.exports = { scope, getWarnLimit, getWarns, resetWarns, addWarn, template, TEMPLATES }
