// État de la connexion WhatsApp, partagé entre connection.js et la page web.
//   status : 'starting' | 'connecting' | 'qr' | 'open' | 'logged_out'

module.exports = {
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
}
