const config = require('./config')
const db = require('./lib/db')

async function main() {
  console.log(`🚀 ${config.BOT_NAME} v${config.VERSION}`)

  const driver = await db.init()
  console.log(`💾 Stockage : ${driver}`)
  require('./lib/vars').apply() // variables définies avec setvar

  const { loadPlugins, loadExternalPlugins } = require('./lib/loader')
  const plugins = loadPlugins()
  const external = loadExternalPlugins()
  console.log(`🧩 ${plugins.length} plugin(s) chargé(s)${external.length ? ` + ${external.length} externe(s)` : ''}`)

  const connection = require('./lib/connection')
  // Le serveur web démarre en premier : les hébergeurs (Render...) exigent un port ouvert rapidement
  const server = require('./lib/web').startWeb()
  await connection.start()

  const shutdown = async () => {
    await connection.close()
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
