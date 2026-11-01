const { bot, db, moderation, utils, groups } = require('../lib')
const { jidNum, norm } = utils

const scope = (jid) => `group:${jid}`
const get = (jid) => db.get(scope(jid), 'antilink', { enabled: false, action: 'null', urls: [] })
const save = (jid, v) => db.set(scope(jid), 'antilink', v)

// "https://www.Facebook.com/x/" -> "facebook.com/x"
const normalizeUrl = (u) =>
  String(u).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')

const TLD = 'com|net|org|info|io|me|co|xyz|app|dev|link|site|online|shop|store|tv|fm|gg|ly|to|cc|ws|biz|ai|fun|club|top|vip|live|cloud|tech|pro|ru|cn|fr|de|uk|ci|sn|cm'
const URL_RE = new RegExp(`(?:https?:\\/\\/|www\\.)[^\\s]+|\\b(?:[a-z0-9-]+\\.)+(?:${TLD})\\b(?:\\/[^\\s]*)?`, 'gi')

// Un lien est interdit si : il figure dans la liste "!" ; sinon, s'il existe une liste d'autorisés,
// tout ce qui n'y figure pas ; sinon (aucune liste) tous les liens sont interdits.
function isBlocked(url, list) {
  const u = normalizeUrl(url)
  const hit = (entry) => u === entry || u.startsWith(entry) || u.includes(entry)
  const allowed = list.filter((x) => !x.startsWith('!')).map(normalizeUrl)
  const denied = list.filter((x) => x.startsWith('!')).map((x) => normalizeUrl(x.slice(1)))
  if (denied.some(hit)) return true
  if (allowed.length) return !allowed.some(hit)
  return denied.length === 0
}

bot(
  { name: 'antilink', desc: "Anti-lien : on/off, kick|warn|null, allow/disallow/list/clear", type: 'groupe', onlyGroup: true, admin: true },
  async (m, match) => {
    const cfg = get(m.jid)
    const status = cfg.enabled ? 'on' : 'off'
    const example = `Statut de l'anti-lien : *${status}* (action : *${cfg.action}*)\n\n> Exemples d'utilisation :\n- antilink list — voir les paramètres\n- antilink allow whatsapp.com — autoriser des URL\n- antilink disallow facebook.com — interdire des URL\n- antilink clear allow | clear disallow | clear — vider les listes\n- antilink on | off — activer/désactiver\n- antilink kick | warn | null — action (null = supprimer seulement)`
    if (!match) return m.reply(example)

    const cmd = match.split(/\s+/)[0].toLowerCase()
    const args = match.slice(cmd.length).trim()
    const urls = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).map(normalizeUrl)

    if (cmd === 'on' || cmd === 'off') {
      if (cmd === 'off' && !cfg.enabled) return m.reply("_L'anti-lien est déjà désactivé._")
      save(m.jid, { ...cfg, enabled: cmd === 'on' })
      return m.reply(`L'anti-lien est maintenant *${cmd === 'on' ? 'activé' : 'désactivé'}*.`)
    }
    if (['kick', 'warn', 'null'].includes(cmd)) {
      save(m.jid, { ...cfg, action: cmd })
      return m.reply(`Action de l'anti-lien mise à jour à : *${cmd}*`)
    }
    if (cmd === 'allow' || cmd === 'disallow') {
      if (!args) return m.reply(`*Donnez au moins une URL à ${cmd === 'allow' ? 'autoriser' : 'interdire'}.*`)
      const add = urls(args).map((u) => (cmd === 'disallow' ? `!${u}` : u))
      // une URL ne peut pas être à la fois autorisée et interdite
      const opposite = new Set(add.map((x) => (x.startsWith('!') ? x.slice(1) : `!${x}`)))
      const list = cfg.urls.filter((x) => !opposite.has(x))
      const fresh = add.filter((x) => !list.includes(x))
      if (!fresh.length) return m.reply('*Aucune nouvelle URL à ajouter.*')
      save(m.jid, { ...cfg, urls: [...list, ...fresh] })
      return m.reply(`*Liste mise à jour* (${cmd === 'allow' ? 'autorisées' : 'interdites'}) :\n${fresh.map((x) => x.replace(/^!/, '')).join(', ')}\n\n_Les URL ne sont pas sensibles à la casse._`)
    }
    if (cmd === 'list' || cmd === 'info') {
      if (!cfg.urls.length) return m.reply("L'anti-lien bloque tous les liens (aucune liste définie). Utilisez *antilink allow* ou *antilink disallow*.")
      const a = cfg.urls.filter((x) => !x.startsWith('!')).join(', ') || '—'
      const d = cfg.urls.filter((x) => x.startsWith('!')).map((x) => x.slice(1)).join(', ') || '—'
      return m.reply(`> Statut de l'anti-lien : ${status}\n*URL autorisées :* ${a}\n*URL interdites :* ${d}\n*Action :* ${cfg.action}`)
    }
    if (cmd === 'clear') {
      const t = args.toLowerCase()
      if (!t) {
        save(m.jid, { ...cfg, urls: [] })
        return m.reply('*Paramètres de liens effacés.*')
      }
      if (t.startsWith('allow')) {
        save(m.jid, { ...cfg, urls: cfg.urls.filter((x) => x.startsWith('!')) })
        return m.reply('*Liste des URL autorisées effacée.*')
      }
      if (t.startsWith('disallow')) {
        save(m.jid, { ...cfg, urls: cfg.urls.filter((x) => !x.startsWith('!')) })
        return m.reply('*Liste des URL interdites effacée.*')
      }
    }
    return m.reply(example)
  }
)

bot({ on: 'message' }, async (m, ctx) => {
  if (!m.isGroup || m.fromMe || !m.text) return
  const cfg = get(m.jid)
  if (!cfg.enabled) return
  const found = m.text.match(URL_RE)
  if (!found || !found.some((u) => isBlocked(u, cfg.urls))) return

  const info = await m.groupInfo()
  if (!info.isBotAdmin || info.isAdmin || m.isOwner) return

  await m.deleteMessage().catch(() => {})
  if (cfg.action === 'kick') {
    await m.sock.groupParticipantsUpdate(m.jid, [m.sender], 'remove').catch(() => {})
    return m.send(`🚫 @${jidNum(m.sender)} a été expulsé pour envoi de lien.`, { mentions: [m.sender] })
  }
  if (cfg.action === 'warn') {
    const r = await moderation.addWarn(m.sock, m.jid, m.sender).catch(() => null)
    if (!r) return
    const text = r.kicked
      ? moderation.template('WARN_KICK_MESSAGE', { mention: `@${jidNum(m.sender)}` })
      : moderation.template('WARN_MESSAGE', { mention: `@${jidNum(m.sender)}`, reason: 'envoi de lien', remaining: r.remaining, warn: r.limit })
    return m.send(text, { mentions: [m.sender] })
  }
})

module.exports = { normalizeUrl, isBlocked, URL_RE }
