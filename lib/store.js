// Mémoire tampon des derniers messages reçus (utile pour anti-suppression, forward, etc.)
// Limitée en taille : les plus anciens sont oubliés.

const MAX = Number(process.env.STORE_MAX) || 3000
const map = new Map()

const k = (jid, id) => `${jid}|${id}`

module.exports = {
  put(raw) {
    if (!raw?.key?.id) return
    map.set(k(raw.key.remoteJid, raw.key.id), raw)
    if (map.size > MAX) map.delete(map.keys().next().value)
  },
  get: (jid, id) => map.get(k(jid, id)),
  size: () => map.size,
}
