const { bot } = require('../lib')
const google = require('../lib/google')
const vars = require('../lib/vars')

// Connexion Google (Drive / Agenda / Tâches) pour backup, gupload, reminder, task
bot({ name: 'gauth', desc: 'Connexion Google : gauth auth · code <url> · import · status · logout', type: 'bot', owner: true }, async (m, match) => {
  const [sub, ...rest] = match.trim().split(/\s+/)
  const arg = rest.join(' ')
  const guide = `*Connexion Google — mise en place :*\n1. console.cloud.google.com → créer un projet et activer les API *Drive*, *Calendar* et *Tasks*\n2. « Identifiants » → Créer → *ID client OAuth* de type *Application de bureau*\n3. Envoyez le fichier JSON téléchargé, puis répondez-lui avec : gauth import\n   (ou : setvar GOOGLE_CLIENT_ID = … et setvar GOOGLE_CLIENT_SECRET = …)\n4. gauth auth → ouvrez le lien, acceptez, puis copiez l'URL où vous êtes redirigé (page « localhost » en erreur : c'est normal)\n5. gauth code <URL copiée>`
  if (!sub) return m.reply(`*Commandes :*\n- gauth auth\n- gauth code <url_ou_code>\n- gauth import (en répondant à credentials.json)\n- gauth status\n- gauth logout\n\n${guide}`)

  if (sub === 'status') return m.reply(`*Client OAuth :* ${google.hasClient() ? 'configuré ✅' : 'absent ❌'}\n*Compte Google :* ${google.isAuthed() ? 'connecté ✅' : 'non connecté'}`)
  if (sub === 'logout') {
    google.logout()
    return m.reply('Jetons Google supprimés.')
  }
  if (sub === 'import') {
    if (!m.quoted || m.mediaType !== 'document') return m.reply('Répondez au fichier *credentials.json* avec : gauth import')
    try {
      const j = JSON.parse((await m.downloadMedia()).toString())
      const c = j.installed || j.web
      if (!c?.client_id || !c?.client_secret) throw new Error('format inattendu')
      vars.set('GOOGLE_CLIENT_ID', c.client_id)
      vars.set('GOOGLE_CLIENT_SECRET', c.client_secret)
      return m.reply('Identifiants importés ✅ Faites maintenant : gauth auth')
    } catch (e) {
      return m.reply(`❌ credentials.json invalide : ${e.message}`)
    }
  }
  if (sub === 'auth') {
    if (!google.hasClient()) return m.reply(`Aucun client OAuth configuré.\n\n${guide}`)
    return m.reply(`1. Ouvrez ce lien et acceptez :\n${google.authUrl()}\n\n2. Copiez l'URL de la page où vous arrivez (elle commence par http://localhost/?code=…)\n3. Envoyez : gauth code <URL>`)
  }
  if (sub === 'code') {
    if (!arg) return m.reply('Exemple : gauth code http://localhost/?code=4/0A…')
    try {
      await google.exchange(arg)
      await m.deleteMessage().catch(() => {})
      return m.send('Google connecté ✅')
    } catch (e) {
      return m.reply(`❌ ${e.message}`)
    }
  }
  await m.reply('Sous-commande inconnue. Tapez : gauth')
})
