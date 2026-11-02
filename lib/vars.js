// Variables propres à chaque utilisateur (commandes setvar / getvar / delvar / allvar), stockées en base
// dans la session de l'utilisateur. Elles n'affectent jamais le serveur ni les autres utilisateurs.
const db = require('./db')

// Seules ces variables peuvent être modifiées depuis WhatsApp
const ALLOWED = [
  'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OPENWEATHER_API_KEY', 'NEWS_API_KEY',
  'OMDB_API_KEY', 'REMOVEBG_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'AI_PROVIDER', 'AI_SYSTEM_MSG', 'OPENAI_MODEL', 'OPENAI_IMAGE_MODEL', 'GEMINI_MODEL', 'GEMINI_IMAGE_MODEL',
  'GROQ_MODEL', 'OPENROUTER_MODEL', 'LANG_CODE', 'NEWS_COUNTRY', 'WCG_LANG', 'WARN_LIMIT',
]
const isAllowed = (key) => ALLOWED.includes(key)

const all = () => db.get('global', 'vars', {})
const set = (key, value) => db.set('global', 'vars', { ...all(), [key]: value })
const del = (key) => {
  const v = { ...all() }
  if (!(key in v)) return false
  delete v[key]
  db.set('global', 'vars', v)
  return true
}
const SECRET = /KEY|TOKEN|SECRET|PASSWORD|PASS|COOKIE|DATABASE_URL/i
const mask = (key, value) => (SECRET.test(key) && String(value).length > 6 ? `${String(value).slice(0, 4)}…(${String(value).length} car.)` : String(value))

module.exports = { ALLOWED, isAllowed, all, set, del, mask }
