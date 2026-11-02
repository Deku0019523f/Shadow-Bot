require('dotenv').config()

const digits = (v) => String(v || '').replace(/\D/g, '')

module.exports = {
  BOT_NAME: process.env.BOT_NAME || 'Shadow Bot',
  VERSION: require('./package.json').version,

  // Préfixe des commandes (ex: ".ping")
  PREFIX: process.env.PREFIX || '.',

  // Numéros « opérateur » (vous, qui hébergez le bot), séparés par des virgules, format international sans "+".
  // Seul un compte relié avec l'un de ces numéros peut utiliser restart / update / plugin... Les autres utilisateurs
  // sont propriétaires de LEUR bot uniquement.
  OWNER: (process.env.OWNER || '').split(',').map(digits).filter(Boolean),

  // Nombre maximum de comptes WhatsApp pouvant être reliés en même temps (chaque session consomme de la mémoire)
  MAX_SESSIONS: Number(process.env.MAX_SESSIONS) || 10,

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

  // Clés optionnelles pour les commandes IA / services externes.
  // Lues à la volée : chaque utilisateur peut définir les siennes avec « setvar » (propres à sa session).
  KEYS: Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries({
        OPENAI: 'OPENAI_API_KEY', GEMINI: 'GEMINI_API_KEY', GROQ: 'GROQ_API_KEY', OPENROUTER: 'OPENROUTER_API_KEY',
        OPENWEATHER: 'OPENWEATHER_API_KEY', NEWS: 'NEWS_API_KEY', OMDB: 'OMDB_API_KEY', REMOVEBG: 'REMOVEBG_API_KEY',
        GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID', GOOGLE_CLIENT_SECRET: 'GOOGLE_CLIENT_SECRET',
      }).map(([k, env]) => [k, { enumerable: true, get: () => process.env[env] || '' }])
    )
  ),
}
