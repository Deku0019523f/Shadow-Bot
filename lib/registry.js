// Registre des commandes et des écouteurs passifs.
//
// Commande :
//   bot({ name: 'ping', aliases: ['p'], desc: '...', type: 'général',
//         onlyGroup, onlyPm, owner, admin, botAdmin, hidden }, async (m, match, ctx) => {})
//
// Écouteurs passifs (pas de préfixe) :
//   bot({ on: 'message' },      async (m, ctx) => {})        // chaque message entrant
//   bot({ on: 'participants' }, async (event, ctx) => {})    // add/remove/promote/demote dans un groupe
//   bot({ on: 'update' },       async (updates, ctx) => {})  // messages.update (édition, statut...)
//   bot({ on: 'call' },         async (calls, ctx) => {})    // appels entrants
//   bot({ on: 'ready' },        async (sock, ctx) => {})     // à chaque (re)connexion réussie
//   bot({ on: 'tick' },         async (sock, ctx) => {})     // toutes les 30 s (tâches planifiées)

const commands = new Map() // nom/alias -> commande
const list = [] // commandes uniques
const EVENTS = ['message', 'participants', 'update', 'call', 'status', 'ready', 'tick']
const listeners = Object.fromEntries(EVENTS.map((e) => [e, []]))

function bot(opts, handler) {
  if (opts.on) {
    if (!listeners[opts.on]) throw new Error(`Événement inconnu : ${opts.on} (valides : ${EVENTS.join(', ')})`)
    listeners[opts.on].push({ ...opts, handler })
    return
  }
  if (!opts.name) throw new Error('Une commande doit avoir un "name"')

  const cmd = { type: 'général', desc: '', aliases: [], ...opts, handler }
  list.push(cmd)
  for (const n of [cmd.name, ...cmd.aliases]) commands.set(n.toLowerCase(), cmd)
}

module.exports = {
  bot,
  find: (name) => commands.get(name.toLowerCase()),
  all: () => list,
  listeners: (event) => listeners[event] || [],
}
