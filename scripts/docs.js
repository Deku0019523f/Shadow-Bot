// Génère docs/commands.md à partir des plugins : node scripts/docs.js
const fs = require('fs')
const path = require('path')
const { loadPlugins } = require('../lib/loader')
const registry = require('../lib/registry')

loadPlugins()
const byType = {}
for (const c of registry.all()) (byType[c.type || 'divers'] ||= []).push(c)

let md = `# Commandes de Shadow Bot\n\n${registry.all().length} commandes — généré par \`node scripts/docs.js\`. Préfixe par défaut : \`.\`\n\n`
for (const t of Object.keys(byType).sort()) {
  md += `## ${t}\n\n| Commande | Description |\n|---|---|\n`
  for (const c of byType[t].sort((a, b) => a.name.localeCompare(b.name))) {
    const alias = c.aliases?.length ? ` _(${c.aliases.join(', ')})_` : ''
    const flags = [c.owner && 'propriétaire', c.admin && 'admin', c.onlyGroup && 'groupe'].filter(Boolean).join(', ')
    md += `| \`${c.name}\`${alias} | ${(c.desc || '').replace(/\|/g, '\\|')}${flags ? ` — _${flags}_` : ''} |\n`
  }
  md += '\n'
}
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'commands.md'), md)
console.log(`docs/commands.md : ${registry.all().length} commandes`)
process.exit(0)
