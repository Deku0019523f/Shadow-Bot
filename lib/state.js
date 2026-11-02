// État de la connexion WhatsApp d'une session, partagé entre sessions.js, la page web et les plugins.
//   status : 'starting' | 'connecting' | 'qr' | 'open' | 'logged_out'
// `require('./state')` renvoie l'état de la session en cours (contexte) ; hors session, un état neutre.
const ctx = require('./context')

const create = () => ({
  status: 'starting',
  qr: null, // dernière chaîne QR brute (null si inutile)
  pairingCode: null, // dernier code de jumelage demandé
  pairingNumber: null,
  pairingAt: 0,
  user: null, // JID du compte connecté
  startedAt: Date.now(),
  set(patch) {
    Object.assign(this, patch)
  },
})

const fallback = create()
const proxy = new Proxy(fallback, {
  get: (_, k) => (ctx.session()?.state || fallback)[k],
  set: (_, k, v) => ((ctx.session()?.state || fallback)[k] = v, true),
})

module.exports = proxy
module.exports.create = create
