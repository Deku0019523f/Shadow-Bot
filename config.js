require('dotenv').config()

const digits = (v) => String(v || '').replace(/\D/g, '')

module.exports = {
  BOT_NAME: process.env.BOT_NAME || 'Shadow Bot',
  VERSION: require('./package.json').version,

  // Préfixe des commandes (ex: ".ping")
  PREFIX: process.env.PREFIX || '.',

  // Numéros propriétaires, séparés par des virgules, format international sans "+"
  OWNER: (process.env.OWNER || '').split(',').map(digits).filter(Boolean),

  // Optionnel : demande automatiquement un code de jumelage pour ce numéro au démarrage.
  // (Sinon, tout se fait depuis la page web : QR code ou code de jumelage.)
  PAIRING_NUMBER: digits(process.env.PAIRING_NUMBER),

  // "public" = tout le monde peut utiliser le bot, "private" = propriétaire seulement
  MODE: process.env.MODE === 'private' ? 'private' : 'public',

  // Stockage : SQLite local par défaut, PostgreSQL si DATABASE_URL est défini
  DB_PATH: process.env.DB_PATH || './data/bot.db',
  DATABASE_URL: process.env.DATABASE_URL || '',
  DATABASE_SSL: process.env.DATABASE_SSL || '',

  LOG_LEVEL: process.env.LOG_LEVEL || 'warn',

  // Serveur web (page de connexion + /health + API)
  PORT: Number(process.env.PORT) || 3000,
  // Mot de passe de la page web. Vide = un mot de passe aléatoire est généré et affiché dans les logs.
  WEB_PASSWORD: process.env.WEB_PASSWORD || '',
  // URL publique du bot (affichée dans les logs ; utile pour un ping anti-veille)
  PUBLIC_URL: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '',

  // API HTTP (envoi de messages + webhook des messages entrants). Active si API_KEY est défini.
  API_KEY: process.env.API_KEY || '',
  API_WEBHOOK_URL: process.env.API_WEBHOOK_URL || '',

  // Clés optionnelles pour les commandes IA / services externes
  KEYS: {
    OPENAI: process.env.OPENAI_API_KEY || '',
    GEMINI: process.env.GEMINI_API_KEY || '',
    GROQ: process.env.GROQ_API_KEY || '',
    OPENROUTER: process.env.OPENROUTER_API_KEY || '',
    OPENWEATHER: process.env.OPENWEATHER_API_KEY || '',
    NEWS: process.env.NEWS_API_KEY || '',
    OMDB: process.env.OMDB_API_KEY || '',
    REMOVEBG: process.env.REMOVEBG_API_KEY || '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  },
}
