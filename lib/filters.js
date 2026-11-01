// Filtres = réponses automatiques déclenchées par un mot/une expression (mot entier, insensible à la casse)

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function findReply(filters, text) {
  if (!text) return null
  for (const { pattern, text: reply } of filters) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(pattern)}(?![\\p{L}\\p{N}])`, 'iu')
    if (re.test(text)) return reply
  }
  return null
}

// Ajoute/remplace un filtre dans une liste
const upsert = (list, pattern, text) => [...list.filter((f) => f.pattern.toLowerCase() !== pattern.toLowerCase()), { pattern, text }]

module.exports = { findReply, upsert }
