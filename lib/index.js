// Point d'entrée pour les plugins :  const { bot, db, http } = require('../lib')
module.exports = {
  ...require('./registry'), // bot, find, all, listeners
  db: require('./db'),
  config: require('../config'),
  utils: require('./utils'),
  moderation: require('./moderation'),
  groups: require('./groups'),
  http: require('./http'),
  ffmpeg: require('./ffmpeg'),
  ytdlp: require('./ytdlp'),
  dl: require('./dl'),
  sticker: require('./sticker'),
  store: require('./store'),
  state: require('./state'),
  // Chargés à l'appel pour éviter les dépendances circulaires
  getSock: () => require('./connection').getSock(),
  logger: require('./logger'),
}
