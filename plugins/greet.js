const { bot, db } = require('../lib')

// Message d'accueil envoyé automatiquement aux personnes qui vous écrivent en privé
// (au plus une fois toutes les 24 h par personne).
const COOLDOWN = 24 * 3600 * 1000
const get = () => db.get('global', 'personal_greet', null)

bot(
  { name: 'setgreet', desc: "Définit le message d'accueil privé", type: 'perso', owner: true },
  async (m, match) => {
    if (!match) return m.reply('> *Exemple :* setgreet Salut, ceci est un bot. Mon patron répondra sous peu.')
    db.set('global', 'personal_greet', match)
    await m.reply("_Message de salutation mis à jour._")
  }
)

bot({ name: 'getgreet', desc: "Affiche le message d'accueil privé", type: 'perso', owner: true }, async (m) => {
  const g = get()
  await m.reply(g || "> Aucun message de salutation n'a été défini.")
})

bot({ name: 'delgreet', desc: "Supprime le message d'accueil privé", type: 'perso', owner: true }, async (m) => {
  db.del('global', 'personal_greet')
  await m.reply('Message de salutation supprimé.')
})

bot({ on: 'message' }, async (m, ctx) => {
  const greet = get()
  if (!greet || m.isGroup || m.fromMe || m.isOwner || !m.text) return
  if (m.text.startsWith(ctx.PREFIX)) return
  const seen = db.get('global', 'greeted', {})
  const now = Date.now()
  if (now - (seen[m.sender] || 0) < COOLDOWN) return
  // purge des entrées expirées pour garder la table petite
  for (const k of Object.keys(seen)) if (now - seen[k] > COOLDOWN) delete seen[k]
  seen[m.sender] = now
  db.set('global', 'greeted', seen)
  await m.send(greet)
})
