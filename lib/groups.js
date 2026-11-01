const { norm } = require('./utils')

// Cache des métadonnées de groupe (évite de redemander à WhatsApp à chaque message)
const cache = new Map()
const TTL = 60_000

async function getMeta(sock, jid) {
  const hit = cache.get(jid)
  if (hit && Date.now() - hit.t < TTL) return hit.meta
  const meta = await sock.groupMetadata(jid)
  cache.set(jid, { meta, t: Date.now() })
  return meta
}

const peek = (jid) => cache.get(jid)?.meta
const invalidate = (jid) => cache.delete(jid)

// Un participant peut être identifié par plusieurs formes d'ID (LID ou numéro)
const idsOf = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(norm)

// Retourne 'admin' | 'superadmin' | null pour un ensemble d'IDs
function adminLevel(meta, ids) {
  const p = meta.participants.find((x) => idsOf(x).some((i) => ids.includes(i)))
  if (!p) return null
  return p.admin || (p.isSuperAdmin ? 'superadmin' : p.isAdmin ? 'admin' : null)
}

module.exports = { getMeta, peek, invalidate, adminLevel, idsOf }
