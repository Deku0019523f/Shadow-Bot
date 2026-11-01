const { bot, db, utils, http } = require('../lib')
const { jidNum } = utils

// Messages de bienvenue / d'au revoir.
// Marqueurs : &mention (membre) · &name (nom du groupe) · &desc (description) · &size (nb de membres) · &pp (photo de profil du membre)
// Média : répondre à une image/vidéo en définissant le message, OU inclure une URL d'image/vidéo dans le texte.
const KINDS = {
  welcome: { event: 'add', label: 'Bienvenue', article: 'La bienvenue', set: 'Salut &mention ! Bienvenue à &name' },
  goodbye: { event: 'remove', label: 'Au revoir', article: "L'au revoir", set: 'Au revoir &mention ! À bientôt' },
}
const MAX_MEDIA = 2 * 1024 * 1024 // média enregistré en base : 2 Mo max

const key = (kind) => kind
const get = (jid, kind) => db.get(`group:${jid}`, key(kind), null)
const save = (jid, kind, v) => db.set(`group:${jid}`, key(kind), v)

const EXTRACT_URL = /https?:\/\/\S+\.(?:jpe?g|png|webp|gif|mp4|mov|webm)(?:\?\S*)?/i

async function render(sock, jid, kind, userJid) {
  const cfg = get(jid, kind)
  if (!cfg?.message) return null
  const meta = await sock.groupMetadata(jid).catch(() => ({ subject: '', desc: '', participants: [] }))
  const wantsPp = /&pp\b/.test(cfg.message)
  let text = cfg.message
    .replace(/&pp\b/g, '')
    .replace(/&mention\b/g, `@${jidNum(userJid)}`)
    .replace(/&name\b/g, meta.subject || '')
    .replace(/&desc\b/g, meta.desc || '')
    .replace(/&size\b/g, String(meta.participants?.length ?? ''))
    .trim()

  let media = null // { source, type }
  if (cfg.media) media = { source: Buffer.from(cfg.media.data, 'base64'), type: cfg.media.type }
  else {
    const url = text.match(EXTRACT_URL)?.[0]
    if (url) {
      text = text.replace(url, '').trim()
      media = { source: { url }, type: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image' }
    }
  }
  if (!media && wantsPp) {
    const url = await sock.profilePictureUrl(userJid, 'image').catch(() => null)
    if (url) media = { source: { url }, type: 'image' }
  }
  const content = media ? { [media.type]: media.source, caption: text, mentions: [userJid] } : { text, mentions: [userJid] }
  return content
}

for (const [name, k] of Object.entries(KINDS)) {
  bot(
    { name, desc: `${k.label} : message automatique (${name} <texte> | on | off | delete)`, type: 'groupe', onlyGroup: true, admin: true },
    async (m, match) => {
      const cfg = get(m.jid, name)
      if (!match) {
        if (cfg?.message) await m.send(cfg.message)
        return m.reply(
          `${k.article} est actuellement *${cfg?.enabled ? 'on' : 'off'}*\n\n> *Exemples d'utilisation :*\n- ${name} ${k.set} — définir le message\n- ${name} on | off — activer/désactiver\n- ${name} delete — supprimer le message\n\n> *Marqueurs :*\n- &mention — mentionner le membre\n- &name — nom du groupe\n- &desc — description du groupe\n- &size — nombre de membres\n- &pp — photo de profil du membre\n\n> *Média :* répondre à une image/vidéo OU inclure une URL dans le message`
        )
      }
      if (match === 'on' || match === 'off') {
        if (!cfg) return m.reply(`_Définissez d'abord un message !_\n\n> *Exemple :*\n${name} ${k.set}\n\nPuis : ${name} on`)
        save(m.jid, name, { ...cfg, enabled: match === 'on' })
        return m.reply(`_${k.label} ${match === 'on' ? 'activé' : 'désactivé'}_`)
      }
      if (match === 'delete') {
        db.del(`group:${m.jid}`, key(name))
        return m.reply(`_Message ${name} supprimé_`)
      }

      let media = null
      if (m.quoted && ['imageMessage', 'videoMessage'].includes(m.quoted.type)) {
        const buf = await m.downloadMedia().catch(() => null)
        if (buf && buf.length <= MAX_MEDIA) media = { data: buf.toString('base64'), type: m.quoted.type === 'videoMessage' ? 'video' : 'image' }
        else if (buf) await m.reply('⚠️ Média trop lourd (2 Mo max) : seul le texte est enregistré. Utilisez une URL pour un gros fichier.')
      }
      save(m.jid, name, { message: match, enabled: true, media })
      const preview = await render(m.sock, m.jid, name, m.sender)
      await m.sendContent(preview, { quoted: m.raw })
    }
  )
}

bot({ on: 'participants' }, async (ev, ctx) => {
  const kind = Object.keys(KINDS).find((n) => KINDS[n].event === ev.action)
  if (!kind) return
  const cfg = get(ev.id, kind)
  if (!cfg?.enabled) return
  for (const p of ev.participants) {
    const user = typeof p === 'string' ? p : p.id
    const content = await render(ctx.sock, ev.id, kind, user)
    if (content) await ctx.sock.sendMessage(ev.id, content).catch(() => {})
  }
})
