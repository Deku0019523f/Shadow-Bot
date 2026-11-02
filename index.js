const config = require('./config')
const db = require('./lib/db')

async function main() {
  console.log(`🚀 ${config.BOT_NAME} v${config.VERSION}`)

  const driver = await db.init()
  console.log(`💾 Stockage : ${driver}`)
  require('./lib/env').install() // process.env propre à chaque utilisateur (setvar)

  const { loadPlugins, loadExternalPlugins } = require('./lib/loader')
  const plugins = loadPlugins()
  const external = loadExternalPlugins()
  console.log(`🧩 ${plugins.length} plugin(s) chargé(s)${external.length ? ` + ${external.length} externe(s)` : ''}`)

  const sessions = require('./lib/sessions')
  // Le serveur web démarre en premier : les hébergeurs (Render...) exigent un port ouvert rapidement
  const server = require('./lib/web').startWeb()
  const restored = await sessions.restoreAll()
  if (restored) console.log(`🔁 ${restored} compte(s) WhatsApp relancé(s)`)

  const shutdown = async () => {
    await sessions.closeAll()
    server.close()
    await db.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Erreur fatale au démarrage :', err)
  process.exit(1)
})

process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err))
