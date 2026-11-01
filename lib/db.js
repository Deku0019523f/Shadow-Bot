// Réglages persistants du bot — API SYNCHRONE pour les plugins.
//
// Tout est chargé en mémoire au démarrage (await db.init()), puis chaque écriture
// est répercutée en arrière-plan dans SQLite/PostgreSQL.
// Les valeurs sont du JSON (objets, tableaux, nombres, chaînes...).
//
//   db.get('global', 'mode', 'public')
//   db.set(`group:${jid}`, 'antilink', { enabled: true })
//   db.del(scope, key) · db.keys(scope, prefix?) · db.delPrefix(scope, prefix) · db.all(scope)

const storage = require('./storage')
const logger = require('./logger')

const cache = new Map() // scope -> Map(key -> valeur)
let queue = Promise.resolve()

// Les écritures sont sérialisées pour conserver l'ordre
const persist = (fn) => {
  queue = queue.then(fn).catch((err) => logger.error({ err }, 'Écriture en base échouée'))
}

const bucket = (scope) => {
  let b = cache.get(scope)
  if (!b) cache.set(scope, (b = new Map()))
  return b
}

module.exports = {
  async init() {
    const driver = await storage.init()
    for (const row of await driver.allKv()) {
      try {
        bucket(row.scope).set(row.key, JSON.parse(row.value))
      } catch {
        /* valeur corrompue ignorée */
      }
    }
    return driver.name
  },

  get(scope, key, fallback = null) {
    const b = cache.get(scope)
    return b && b.has(key) ? b.get(key) : fallback
  },

  set(scope, key, value) {
    bucket(scope).set(key, value)
    const json = JSON.stringify(value)
    persist(() => storage.get().setKv(scope, key, json))
  },

  del(scope, key) {
    if (!cache.get(scope)?.delete(key)) return
    persist(() => storage.get().delKv(scope, key))
  },

  keys(scope, prefix = '') {
    return [...(cache.get(scope)?.keys() || [])].filter((k) => k.startsWith(prefix))
  },

  all(scope) {
    return Object.fromEntries(cache.get(scope) || [])
  },

  delPrefix(scope, prefix) {
    for (const k of this.keys(scope, prefix)) this.del(scope, k)
  },

  // Liste des scopes ("group:xxx@g.us"...) commençant par un préfixe
  scopes(prefix = '') {
    return [...cache.keys()].filter((s) => s.startsWith(prefix))
  },

  async close() {
    await queue
    await storage.get().close()
  },
}
