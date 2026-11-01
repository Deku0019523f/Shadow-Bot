const crypto = require('crypto')
const path = require('path')
const express = require('express')
const QRCode = require('qrcode')

const config = require('../config')
const db = require('./db')
const state = require('./state')
const events = require('./events')
const logger = require('./logger')
const registry = require('./registry')
const storage = require('./storage')
const connection = require('./connection')
const { toJid, formatUptime } = require('./utils')

const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest()
  const y = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(x, y)
}

// Mot de passe de la page web : variable d'environnement, sinon généré une fois et conservé en base
function resolvePassword() {
  if (config.WEB_PASSWORD) return config.WEB_PASSWORD
  let pwd = db.get('global', 'web_password')
  if (!pwd) {
    pwd = crypto.randomBytes(6).toString('hex')
    db.set('global', 'web_password', pwd)
    console.log(`🔐 Mot de passe de la page web (généré) : ${pwd}`)
    console.log('   Définissez WEB_PASSWORD dans votre environnement pour le choisir vous-même.')
  }
  return pwd
}

// Limitation des tentatives de connexion ratées (par IP)
const fails = new Map()
const MAX_FAILS = 8
const BLOCK_MS = 10 * 60_000

function startWeb() {
  const password = resolvePassword()
  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  // Ping anti-veille (Render, Koyeb...) — ne révèle rien de sensible
  app.get('/health', (req, res) => res.json({ ok: true, status: state.status }))

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')))

  // --- Routes de la page web (mot de passe) -------------------------------
  const admin = express.Router()
  admin.use((req, res, next) => {
    const ip = req.ip
    const f = fails.get(ip)
    if (f && f.count >= MAX_FAILS && Date.now() < f.until) {
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' })
    }
    if (!safeEqual(req.get('x-admin-password') || '', password)) {
      const cur = f && Date.now() < f.until ? f : { count: 0, until: 0 }
      fails.set(ip, { count: cur.count + 1, until: Date.now() + BLOCK_MS })
      return res.status(401).json({ error: 'Mot de passe incorrect' })
    }
    fails.delete(ip)
    next()
  })

  let qrCache = { raw: null, url: null }
  admin.get('/status', async (req, res) => {
    let qr = null
    if (state.status === 'qr' && state.qr) {
      if (qrCache.raw !== state.qr) {
        qrCache = { raw: state.qr, url: await QRCode.toDataURL(state.qr, { margin: 1, width: 320 }) }
      }
      qr = qrCache.url
    }
    const codeFresh = state.pairingCode && Date.now() - state.pairingAt < 170_000
    res.json({
      status: state.status,
      user: state.user,
      qr,
      pairingCode: codeFresh ? state.pairingCode : null,
      pairingNumber: codeFresh ? state.pairingNumber : null,
      uptime: formatUptime(process.uptime()),
      mode: db.get('global', 'mode', config.MODE),
      commands: registry.all().length,
      storage: storage.name(),
      botName: config.BOT_NAME,
      version: config.VERSION,
    })
  })

  admin.post('/pairing', async (req, res) => {
    try {
      const code = await connection.requestPairing(req.body?.number)
      res.json({ code })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  admin.post('/logout', async (req, res) => {
    res.json({ ok: true })
    connection.logout().catch((err) => logger.error({ err }, 'Déconnexion échouée'))
  })

  app.use('/api/web', admin)

  // --- API programmatique (clé API) — active seulement si API_KEY est défini
  if (config.API_KEY) {
    const api = express.Router()
    api.use((req, res, next) => {
      if (!safeEqual(req.get('x-api-key') || '', config.API_KEY)) {
        return res.status(401).json({ error: 'Clé API invalide' })
      }
      next()
    })

    api.get('/status', (req, res) => res.json({ status: state.status, user: state.user }))

    api.post('/send', async (req, res) => {
      const sock = connection.getSock()
      if (state.status !== 'open' || !sock) return res.status(503).json({ error: 'Bot non connecté' })
      const { to, text } = req.body || {}
      if (!to || !text) return res.status(400).json({ error: 'Champs "to" et "text" requis' })
      const jid = String(to).includes('@') ? to : toJid(to)
      if (!jid) return res.status(400).json({ error: 'Destinataire invalide' })
      try {
        const sent = await sock.sendMessage(jid, { text: String(text) })
        res.json({ ok: true, id: sent?.key?.id })
      } catch (err) {
        logger.error({ err }, 'Échec envoi API')
        res.status(500).json({ error: "Échec de l'envoi" })
      }
    })
    app.use('/api', api)

    if (config.API_WEBHOOK_URL) {
      events.on('message', (m) => {
        if (m.fromMe) return
        fetch(config.API_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': config.API_KEY },
          body: JSON.stringify({
            id: m.id,
            from: m.sender,
            chat: m.jid,
            isGroup: m.isGroup,
            pushName: m.pushName,
            type: m.type,
            text: m.text,
          }),
        }).catch((err) => logger.warn({ err: err.message }, 'Webhook injoignable'))
      })
    }
  }

  // Anti-veille (Render gratuit : le service s'endort après ~15 min sans visite et le bot se déconnecte).
  // Le bot s'appelle lui-même par son URL publique toutes les 10 min.
  if (config.PUBLIC_URL && /^https?:\/\//.test(config.PUBLIC_URL) && !/localhost|127\.0\.0\.1/.test(config.PUBLIC_URL)) {
    const ping = () => fetch(`${config.PUBLIC_URL.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(15_000) }).catch(() => {})
    setInterval(ping, 10 * 60_000).unref?.()
  }

  return app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`🌐 Page de connexion : ${config.PUBLIC_URL || `http://localhost:${config.PORT}`}`)
  })
}

module.exports = { startWeb }
