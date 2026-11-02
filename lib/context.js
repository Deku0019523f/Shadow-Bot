// Contexte de session : chaque utilisateur (compte WhatsApp relié) a ses propres réglages, sa propre connexion
// et son propre état. Le code des plugins ne change pas : db, state, process.env... s'adaptent à la session
// en cours grâce à AsyncLocalStorage.
const { AsyncLocalStorage } = require('async_hooks')

const als = new AsyncLocalStorage()

module.exports = {
  run: (session, fn) => als.run(session, fn),
  session: () => als.getStore() || null,
}
