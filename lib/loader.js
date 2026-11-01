const fs = require('fs')
const path = require('path')
const logger = require('./logger')

// Charge tous les fichiers de ./plugins (ceux qui commencent par "_" sont ignorés)
function loadPlugins(dir = path.join(__dirname, '..', 'plugins')) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_'))
  const loaded = []
  for (const file of files) {
    try {
      require(path.join(dir, file))
      loaded.push(file)
    } catch (err) {
      // Un plugin cassé ne doit pas empêcher le bot de démarrer
      logger.error({ err, file }, 'Plugin non chargé')
      console.error(`⚠️  Plugin ignoré (${file}) : ${err.message}`)
    }
  }
  return loaded
}

// Plugins externes installés par la commande `plugin` (dossier persistant data/eplugins)
const EXTERNAL_DIR = path.join(__dirname, '..', 'data', 'eplugins')

function loadExternalPlugins() {
  if (!fs.existsSync(EXTERNAL_DIR)) return []
  return loadPlugins(EXTERNAL_DIR)
}

module.exports = { loadPlugins, loadExternalPlugins, EXTERNAL_DIR }
