const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { bot, db, config, http, utils, state } = require('../lib')
const vars = require('../lib/vars')
const { EXTERNAL_DIR } = require('../lib/loader')

// Administration du bot (propriétaire uniquement)
const OWN = { type: 'bot', owner: true }
const sh = (cmd, args, opts = {}) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 180_000, cwd: path.join(__dirname, '..'), ...opts }, (e, out, err) => (e ? reject(new Error((err || e.message).trim().split('\n').pop())) : resolve(out.trim()))))

// --- variables -------------------------------------------------------------------------------------------------
bot({ name: 'setvar', desc: 'Définit une variable (setvar CLE = valeur ; ex : setvar GEMINI_API_KEY = …)', ...OWN }, async (m, match) => {
  const i = match.indexOf('=')
  const key = match.slice(0, i).trim().toUpperCase()
  const value = match.slice(i + 1).trim()
  if (i < 0 || !/^[A-Z][A-Z0-9_]*$/.test(key) || !value) return m.reply('Exemple : setvar CLE = valeur')
  vars.set(key, value)
  if (/KEY|TOKEN|SECRET|PASSWORD/.test(key)) await m.deleteMessage().catch(() => {}) // évite de laisser une clé dans le chat
  await m.send(`Nouvelle variable *${key}* définie : ${vars.mask(key, value)}`)
})
bot({ name: 'getvar', desc: 'Affiche une variable (getvar CLE)', ...OWN }, async (m, match) => {
  const key = match.trim().toUpperCase()
  if (!key) return m.reply('Exemple : getvar WARN_LIMIT')
  const v = vars.all()[key]
  await m.reply(v === undefined ? `${key} introuvable dans les variables.` : `${key} = ${v}`)
})
bot({ name: 'delvar', desc: 'Supprime une variable (delvar CLE)', ...OWN }, async (m, match) => {
  const key = match.trim().toUpperCase()
  if (!key) return m.reply('Exemple : delvar WARN_LIMIT')
  await m.reply(vars.del(key) ? `${key} supprimée.` : `${key} introuvable dans les variables.`)
})
bot({ name: 'allvar', desc: 'Liste toutes les variables (valeurs sensibles masquées)', ...OWN }, async (m) => {
  const e = Object.entries(vars.all()).sort(([a], [b]) => a.localeCompare(b))
  await m.reply(e.length ? e.map(([k, v]) => `${k} = ${vars.mask(k, v)}`).join('\n') : 'Aucune variable définie.')
})

// --- réglages ------------------------------------------------------------------------------------------------------
bot({ name: 'mode', desc: 'Mode du bot : mode public | private', ...OWN }, async (m, match) => {
  const cur = db.get('global', 'mode', config.MODE)
  if (!['public', 'private'].includes(match)) return m.reply(`Mode actuel : *${cur}*\nUsage : mode public | private\n_private : seul le propriétaire (et les commandes autorisées par zushi) · public : tout le monde_`)
  db.set('global', 'mode', match)
  await m.reply(`Mode *${match}* activé.`)
})
bot({ name: 'setprefix', desc: 'Change le préfixe (setprefix ! · setprefix off pour aucun)', ...OWN }, async (m, match) => {
  if (!match) return m.reply(`Préfixe actuel : *${db.get('global', 'prefix', config.PREFIX)}*\nExemple : setprefix !`)
  const p = match.toLowerCase() === 'off' ? '' : match.trim()
  db.set('global', 'prefix', p)
  await m.reply(p ? `Préfixe changé en *${p}*` : 'Préfixe supprimé : les commandes s\'écrivent sans symbole.')
})

// --- processus -------------------------------------------------------------------------------------------------------
const exitSoon = (code = 0) => setTimeout(() => process.exit(code), 1500)
bot({ name: 'restart', aliases: ['reboot'], desc: 'Redémarre le bot (nécessite PM2, Docker, Render… qui relance le processus)', ...OWN }, async (m) => {
  await m.reply('_Redémarrage…_')
  exitSoon(0)
})
bot({ name: 'shutdown', desc: 'Arrête le bot (avec PM2 : pm2 stop ; sinon le processus se termine)', ...OWN }, async (m) => {
  await m.reply('_Arrêt…_')
  if (process.env.pm_id !== undefined) sh('pm2', ['stop', process.env.pm_id]).catch(() => exitSoon(0))
  else exitSoon(0)
})
bot({ name: 'dyno', aliases: ['sysinfo'], desc: 'État du serveur (uptime, mémoire, version)', ...OWN }, async (m) => {
  const os = require('os')
  await m.reply(
    [
      `*${config.BOT_NAME}* v${config.VERSION}`,
      `*Statut WhatsApp :* ${state.status}`,
      `*Uptime :* ${utils.formatUptime(process.uptime())}`,
      `*Mémoire :* ${utils.ramUsage()} / ${(os.totalmem() / 1073741824).toFixed(1)} Go`,
      `*Charge CPU :* ${os.loadavg().map((x) => x.toFixed(2)).join(' ')}`,
      `*Node :* ${process.version} — ${os.platform()}`,
      `*Stockage :* ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`,
    ].join('\n')
  )
})

// --- mise à jour (dépôt git) -----------------------------------------------------------------------------------------------
const isGit = () => fs.existsSync(path.join(__dirname, '..', '.git'))
bot({ name: 'update', desc: 'Vérifie les mises à jour git (update) · installe et redémarre (update now)', ...OWN }, async (m, match) => {
  if (!isGit()) return m.reply('Ce déploiement n\'est pas un dépôt git (image Docker ?). Redéployez depuis votre dépôt pour mettre à jour.')
  try {
    if (match === 'now') {
      await m.reply('_Mise à jour…_')
      const out = await sh('git', ['pull', '--ff-only'])
      if (/Already up to date|Déjà à jour/i.test(out)) return m.reply('Le bot est déjà à jour.')
      await sh('npm', ['install', '--omit=dev'], { timeout: 480_000 })
      await m.reply('_Mise à jour installée, redémarrage…_')
      return exitSoon(0)
    }
    await sh('git', ['fetch', '--quiet'])
    const log = await sh('git', ['log', 'HEAD..@{u}', '--pretty=format:- %s (%h)'])
    await m.reply(log ? `${log.split('\n').length} mise(s) à jour disponible(s) :\n${log}\n\n_update now pour installer_` : 'Le bot est déjà à jour.')
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
})

// --- plugins externes ----------------------------------------------------------------------------------------------------------
const HOSTS = ['gist.github.com', 'gist.githubusercontent.com', 'raw.githubusercontent.com']
const list = () => (fs.existsSync(EXTERNAL_DIR) ? fs.readdirSync(EXTERNAL_DIR).filter((f) => f.endsWith('.js')) : [])
bot({ name: 'plugin', desc: 'Installe un plugin depuis un Gist/raw GitHub (plugin lien) · plugin list', ...OWN }, async (m, match) => {
  if (!match || match === 'list') {
    const l = list()
    return m.reply(l.length ? `Plugins externes :\n${l.map((f) => `- ${f.replace(/\.js$/, '')}`).join('\n')}` : '> Exemple :\n- plugin <lien Gist>\n- plugin list\n\n_Aucun plugin externe installé._')
  }
  let url
  try { url = new URL(match.trim()) } catch { return m.reply('Lien invalide.') }
  if (url.protocol !== 'https:' || !HOSTS.includes(url.host)) return m.reply(`Seuls les liens https vers ${HOSTS.join(', ')} sont acceptés.`)
  if (url.host === 'gist.github.com') url = new URL(`https://gist.githubusercontent.com${url.pathname.replace(/\/$/, '')}/raw`)
  let code = await http.getText(url.href)
  if (code.length > 300_000) return m.reply('Fichier trop volumineux.')
  const name = (code.match(/name:\s*['"]([\w-]+)['"]/)?.[1] || path.basename(url.pathname, '.js') || `plugin${Date.now()}`).replace(/[^\w-]/g, '')
  code = code.replace(/require\((['"])(\.\.\/)+lib/g, `require($1${path.join(__dirname, '..', 'lib').replace(/\\/g, '/')}`)
  fs.mkdirSync(EXTERNAL_DIR, { recursive: true })
  const file = path.join(EXTERNAL_DIR, `${name}.js`)
  fs.writeFileSync(file, code)
  try {
    delete require.cache[require.resolve(file)]
    require(file)
    await m.reply(`Plugin installé : *${name}*\n⚠️ Un plugin exécute du code avec tous les droits du bot : n'installez que du code que vous avez relu.`)
  } catch (e) {
    fs.rmSync(file, { force: true })
    await m.reply(`❌ Plugin invalide : ${e.message}`)
  }
})
bot({ name: 'remove', desc: 'Supprime un plugin externe (remove nom · remove all)', ...OWN }, async (m, match) => {
  if (!match) return m.reply('> Exemple :\n- remove <nom du plugin>\n- remove all')
  const l = list()
  const gone = match === 'all' ? l : l.filter((f) => f === `${match}.js`)
  if (!gone.length) return m.reply(`Plugin *${match}* introuvable.`)
  gone.forEach((f) => fs.rmSync(path.join(EXTERNAL_DIR, f), { force: true }))
  await m.reply('Plugin(s) supprimé(s). _Effectif après redémarrage (restart)._')
})
