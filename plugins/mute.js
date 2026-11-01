const { bot, db, utils } = require('../lib')
const { localParts, to12h } = utils

// amute / aunmute : fermeture / ouverture quotidienne automatique du groupe à heure fixe (24 h, fuseau TZ).
//   amute 21 30   -> ferme tous les jours à 21:30        (réponse à un texte = message annoncé)
//   aunmute 6 0   -> rouvre tous les jours à 06:00
//   amute info | on | off
const KINDS = {
  amute: { key: 'amute', setting: 'announcement', word: 'fermeture', done: '🔒 Groupe fermé automatiquement.' },
  aunmute: { key: 'aunmute', setting: 'not_announcement', word: 'ouverture', done: '🔓 Groupe rouvert automatiquement.' },
}

const get = (jid, key) => db.get(`group:${jid}`, key, null)
const save = (jid, key, v) => db.set(`group:${jid}`, key, v)

for (const [name, k] of Object.entries(KINDS)) {
  bot(
    { name, desc: `${k.word[0].toUpperCase()}${k.word.slice(1)} automatique quotidienne du groupe (${name} 21 30 | info | on | off)`, type: 'groupe', onlyGroup: true, admin: true, botAdmin: true },
    async (m, match) => {
      const [a, b] = match.split(/\s+/)
      const cfg = get(m.jid, k.key)

      if (a === 'info') {
        if (!cfg) return m.reply(`Aucune ${k.word} automatique programmée.`)
        return m.reply(`*${k.word} automatique*\nHeure : ${cfg.hour}:${String(cfg.minute).padStart(2, '0')} (${to12h(cfg.hour, cfg.minute)})\nStatut : ${cfg.enabled ? 'on' : 'off'}\nMessage : ${cfg.msg || '—'}`)
      }
      if (a === 'on' || a === 'off') {
        if (!cfg) return m.reply(`Aucune ${k.word} automatique programmée.`)
        save(m.jid, k.key, { ...cfg, enabled: a === 'on' })
        return m.reply(`${k.word[0].toUpperCase()}${k.word.slice(1)} automatique ${a === 'on' ? 'activée' : 'désactivée'}.`)
      }
      const h = Number(a)
      const mi = Number(b)
      if (!a || b === undefined || !Number.isInteger(h) || !Number.isInteger(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) {
        return m.reply(`Format invalide.\nExemple : ${name} 21 30 (heure 24 h, fuseau ${utils.TZ})\nAutres : ${name} info | ${name} on | ${name} off`)
      }
      const msg = m.quoted?.text || ''
      save(m.jid, k.key, { hour: h, minute: mi, msg, enabled: true, last: null })
      await m.reply(`✅ ${k.word[0].toUpperCase()}${k.word.slice(1)} programmée chaque jour à ${to12h(h, mi)}${msg ? `\nMessage : ${msg}` : ''}`)
    }
  )
}

// Exécution : dans les 10 minutes suivant l'heure prévue, une fois par jour
bot({ on: 'tick' }, async (sock) => {
  const now = localParts()
  const nowMin = now.hour * 60 + now.minute
  for (const scope of db.scopes('group:')) {
    for (const k of Object.values(KINDS)) {
      const cfg = db.get(scope, k.key)
      if (!cfg || !cfg.enabled || cfg.last === now.date) continue
      const diff = nowMin - (cfg.hour * 60 + cfg.minute)
      if (diff < 0 || diff >= 10) continue
      db.set(scope, k.key, { ...cfg, last: now.date })
      const jid = scope.slice('group:'.length)
      try {
        await sock.groupSettingUpdate(jid, k.setting)
        await sock.sendMessage(jid, { text: cfg.msg || k.done })
      } catch {
        /* le bot n'est plus admin ou a quitté le groupe */
      }
    }
  }
})
