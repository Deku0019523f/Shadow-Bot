const { bot, db, config } = require('../lib')
const google = require('../lib/google')

// Sauvegarde des réglages (hors session WhatsApp) et envoi sur Google Drive
//   backup now      sauvegarde immédiate (Drive si connecté, sinon envoyée au propriétaire)
//   backup restore  (en répondant au fichier de sauvegarde) restaure les réglages
//   gupload [list | get n | del n]  Drive : envoie le média cité, liste, télécharge, supprime
const exportData = () => {
  const out = {}
  for (const s of db.scopes()) out[s] = db.all(s)
  delete out.global?.gtoken // jetons Google : jamais exportés
  return Buffer.from(JSON.stringify({ app: config.BOT_NAME, version: config.VERSION, date: new Date().toISOString(), data: out }))
}

const DRIVE = 'https://www.googleapis.com/drive/v3'
async function upload(name, buf, mime = 'application/octet-stream') {
  const boundary = 'shadow' + Date.now()
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  return google.api('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { body, headers: { 'content-type': `multipart/related; boundary=${boundary}` }, timeout: 300_000 })
}

bot({ name: 'backup', desc: 'Sauvegarde des réglages : backup now · backup restore (répondre au fichier)', type: 'bot', owner: true }, async (m, match) => {
  if (match === 'restore') {
    if (!m.quoted || m.mediaType !== 'document') return m.reply('Répondez au fichier de sauvegarde (.json) avec : backup restore')
    try {
      const j = JSON.parse((await m.downloadMedia()).toString())
      if (!j.data || typeof j.data !== 'object') throw new Error('fichier invalide')
      let n = 0
      for (const [scope, entries] of Object.entries(j.data)) for (const [k, v] of Object.entries(entries)) {
        if (scope === 'global' && k === 'gtoken') continue
        db.set(scope, k, v)
        n++
      }
      return m.reply(`${n} réglages restaurés ✅ (redémarrez avec « restart » pour tout appliquer)`)
    } catch (e) {
      return m.reply(`❌ ${e.message}`)
    }
  }
  if (match !== 'now') return m.reply('*Utilisation :*\n- backup now — sauvegarde immédiate\n- backup restore — restaurer (en répondant au fichier)\n- gauth auth — connecter Google Drive')
  const buf = exportData()
  const name = `shadow-bot-backup-${new Date().toISOString().slice(0, 10)}.json`
  if (google.isAuthed()) {
    try {
      await upload(name, buf, 'application/json')
      return m.reply('Sauvegarde envoyée sur Google Drive ✅')
    } catch (e) {
      await m.reply(`⚠️ Drive : ${e.message}\nEnvoi du fichier ici à la place.`)
    }
  }
  await m.sendMedia(buf, { type: 'document', mimetype: 'application/json', fileName: name })
})

const files = new Map()
const refresh = async () => {
  const r = await google.api('GET', `${DRIVE}/files?pageSize=30&orderBy=createdTime desc&fields=files(id,name,size)`)
  return r.files || []
}
bot({ name: 'gupload', desc: 'Google Drive : gupload (répondre à un média) · list · get n · del n', type: 'bot', owner: true }, async (m, match) => {
  if (!google.isAuthed()) return m.reply('Google non connecté : utilisez *gauth auth*.')
  const [sub, n] = match.trim().split(/\s+/)
  try {
    if (sub === 'list') {
      const l = await refresh()
      files.set(m.sender, l)
      return m.reply(l.length ? l.map((f, i) => `${i + 1}. *${f.name}*`).join('\n') + '\n\n_gupload get n · gupload del n_' : 'Aucun fichier créé par le bot sur Drive.')
    }
    if (sub === 'get' || sub === 'del') {
      const f = (files.get(m.sender) || (await refresh()))[Number(n) - 1]
      if (!f) return m.reply('Fichier introuvable. Faites d\'abord : gupload list')
      if (sub === 'del') {
        await google.api('DELETE', `${DRIVE}/files/${f.id}`)
        return m.reply('Fichier supprimé.')
      }
      const buf = await google.api('GET', `${DRIVE}/files/${f.id}?alt=media`, { buffer: true, timeout: 300_000 })
      return m.sendMedia(buf, { type: 'document', fileName: f.name })
    }
    if (!m.quoted || !m.mediaType) return m.reply('Répondez à un média avec : gupload\nAutres : gupload list · get n · del n')
    const buf = await m.downloadMedia()
    const ext = { image: 'jpg', video: 'mp4', audio: 'mp3', sticker: 'webp' }[m.mediaType] || 'bin'
    const r = await upload(m.quoted.fileName || `shadow-${Date.now()}.${ext}`, buf)
    await m.reply(`Envoyé sur Drive ✅ (${r.name})`)
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
})
