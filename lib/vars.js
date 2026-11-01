// Variables modifiables à chaud (commandes setvar / getvar / delvar / allvar), stockées en base.
// Elles prennent le pas sur l'environnement et sont réappliquées à chaque démarrage.
const config = require('../config')
const db = require('./db')

// Variable d'environnement -> clé de config.KEYS
const KEY_MAP = {
  OPENAI_API_KEY: 'OPENAI', GEMINI_API_KEY: 'GEMINI', GROQ_API_KEY: 'GROQ', OPENROUTER_API_KEY: 'OPENROUTER',
  OPENWEATHER_API_KEY: 'OPENWEATHER', NEWS_API_KEY: 'NEWS', OMDB_API_KEY: 'OMDB', REMOVEBG_API_KEY: 'REMOVEBG',
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID', GOOGLE_CLIENT_SECRET: 'GOOGLE_CLIENT_SECRET',
}

const all = () => db.get('global', 'vars', {})

function applyOne(key, value) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = String(value)
  if (KEY_MAP[key]) config.KEYS[KEY_MAP[key]] = value === undefined ? '' : String(value)
}

const apply = () => Object.entries(all()).forEach(([k, v]) => applyOne(k, v))
const set = (key, value) => {
  db.set('global', 'vars', { ...all(), [key]: value })
  applyOne(key, value)
}
const del = (key) => {
  const v = { ...all() }
  if (!(key in v)) return false
  delete v[key]
  db.set('global', 'vars', v)
  applyOne(key, undefined)
  return true
}
const SECRET = /KEY|TOKEN|SECRET|PASSWORD|PASS|COOKIE|DATABASE_URL/i
const mask = (key, value) => (SECRET.test(key) && String(value).length > 6 ? `${String(value).slice(0, 4)}…(${String(value).length} car.)` : String(value))

module.exports = { all, apply, set, del, mask }
