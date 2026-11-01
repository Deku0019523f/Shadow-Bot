// Vérifie que tous les plugins se chargent, sans doublon de commande.
//   npm run check
const path = require('path')
const fs = require('fs')

const dir = path.join(__dirname, '..', 'plugins')
const registry = require('../lib/registry')
const { loadPlugins } = require('../lib/loader')

const loaded = loadPlugins(dir)
const all = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_'))
const failed = all.filter((f) => !loaded.includes(f))

// Détection des doublons (le registre écrase silencieusement)
const seen = new Map()
const dups = []
for (const c of registry.all()) {
  for (const n of [c.name, ...c.aliases]) {
    const k = n.toLowerCase()
    if (seen.has(k) && seen.get(k) !== c) dups.push(`${k} (${seen.get(k).name} / ${c.name})`)
    seen.set(k, c)
  }
}
const noDesc = registry.all().filter((c) => !c.desc && !c.hidden).map((c) => c.name)

console.log(`Plugins chargés : ${loaded.length}/${all.length}`)
console.log(`Commandes : ${registry.all().length} (noms + alias : ${seen.size})`)
for (const e of ['message', 'participants', 'update', 'call', 'status', 'ready', 'tick']) {
  console.log(`  écouteurs ${e} : ${registry.listeners(e).length}`)
}
if (failed.length) console.log('❌ Plugins en échec :', failed.join(', '))
if (dups.length) console.log('❌ Doublons :', dups.join(', '))
if (noDesc.length) console.log('⚠️  Sans description :', noDesc.join(', '))

process.exit(failed.length || dups.length ? 1 : 0)
