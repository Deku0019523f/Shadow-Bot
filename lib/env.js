// process.env « conscient des sessions » : une variable définie par un utilisateur (setvar) n'est visible
// que dans SA session. Les autres sessions et le serveur gardent leurs valeurs.
const ctx = require('./context')
const db = require('./db')

function install() {
  if (install.done) return
  install.done = true
  const real = process.env
  process.env = new Proxy(real, {
    get(target, key) {
      if (typeof key === 'string' && ctx.session()) {
        const v = db.get('global', 'vars', {})[key]
        if (v !== undefined) return String(v)
      }
      return target[key]
    },
  })
}

module.exports = { install }
