const { EventEmitter } = require('events')

// Bus interne : "message" est émis pour chaque message entrant (utilisé par l'API / webhook)
module.exports = new EventEmitter()
