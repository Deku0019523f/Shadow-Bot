const crypto = require('crypto')
const path = require('path')
const express = require('express')
const QRCode = require('qrcode')

const config = require('../config')
const db = require('./db')
const events = require('./events')
const logger = require('./logger')
const registry = require('./registry')
const storage = require('./storage')
const sessions = require('./sessions')
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

// Limites anti-abus (par IP) : { clé -> [horodatages] }
const hits = new Map()
function limited(key, max, windowMs) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(key, list)
  return list.length > max
}
setInterval(() => {
  const now = Date.now()
  for (const [k, list] of hits) if (!list.some((t) => now - t < 3_600_000)) hits.delete(k)
}, 600_000).unref?.()

const qrCache = new Map() // id -> { raw, url }

function startWeb() {
  const password = resolvePassword()
  const app = express()
  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  // Ping anti-veille (Render, Koyeb...) — ne révèle rien de sensible
  app.get('/health', (req, res) => res.json({ ok: true, sessions: sessions.count() }))

  app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'web', 'index.html')))
  app.get('/logo.jpg', (req, res) => res.sendFile(path.join(__dirname, '..', 'assets', 'logo.jpg'), (err) => err && res.status(404).end()))

  // --- Pages publiques : chaque visiteur relie SON compte WhatsApp ------------------------------------------
  app.get('/api/info', (req, res) =>
    res.json({ botName: config.BOT_NAME, version: config.VERSION, accounts: sessions.count(), max: config.MAX_SESSIONS, full: sessions.count() >= config.MAX_SESSIONS })
  )

  // Données d'une session pour la page (QR, code, état...)
  const view = async (session) => {
    const st = session.state
    let qr = null
    if (st.status === 'qr' && st.qr) {
      let c = qrCache.get(session.id)
      if (!c || c.raw !== st.qr) {
        c = { raw: st.qr, url: await QRCode.toDataURL(st.qr, { margin: 1, width: 320 }) }
        qrCache.set(session.id, c)
      }
      qr = c.url
    }
    const fresh = st.pairingCode && Date.now() - st.pairingAt < 170_000
    return session.run(() => ({
      id: session.id,
      status: st.status,
      user: st.user,
      qr,
      pairingCode: fresh ? st.pairingCode : null,
      pairingNumber: fresh ? st.pairingNumber : null,
      uptime: formatUptime((Date.now() - st.startedAt) / 1000),
      mode: db.get('global', 'mode', config.MODE),
      prefix: db.get('global', 'prefix', config.PREFIX),
      commands: registry.all().filter((c) => !c.hidden && !c.platform).length,
      botName: config.BOT_NAME,
      version: config.VERSION,
    }))
  }

  // Authentifie l'utilisateur par l'identifiant + jeton secret (conservé dans son navigateur)
  const own = (req, res, next) => {
    const k = `bad:${req.ip}`
    if ((hits.get(k) || []).filter((t) => Date.now() - t < 10 * 60_000).length >= 30) return res.status(429).json({ error: 'Trop de tentatives.' })
    const session = sessions.verify(req.params.id, req.get('x-session-token'))
    if (!session) {
      limited(k, 30, 10 * 60_000) // seuls les échecs comptent
      return res.status(401).json({ error: 'Session introuvable ou expirée.' })
    }
    req.session = session
    next()
  }

  app.post('/api/session', async (req, res) => {
    if (limited(`new:${req.ip}`, 5, 60 * 60_000)) return res.status(429).json({ error: 'Trop de demandes. Réessayez plus tard.' })
    try {
      const { session, token } = await sessions.create()
      res.json({ id: session.id, token })
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message })
    }
  })

  app.get('/api/session/:id/status', own, async (req, res) => res.json(await view(req.session)))

  app.post('/api/session/:id/pairing', own, async (req, res) => {
    if (limited(`pair:${req.session.id}`, 8, 10 * 60_000)) return res.status(429).json({ error: 'Trop de demandes de code. Patientez quelques minutes.' })
    try {
      res.json({ code: await req.session.requestPairing(req.body?.number) })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  // Relance une liaison (QR / code) après une déconnexion
  app.post('/api/session/:id/relink', own, async (req, res) => {
    if (req.session.state.status === 'open') return res.json({ ok: true })
    req.session.relink().catch((err) => logger.error({ err }, 'Reliaison échouée'))
    res.json({ ok: true })
  })

  // Déconnecte et SUPPRIME le bot de l'utilisateur (compte WhatsApp, réglages, clés)
  app.delete('/api/session/:id', own, async (req, res) => {
    res.json({ ok: true })
    qrCache.delete(req.session.id)
    sessions.destroy(req.session.id).catch((err) => logger.error({ err }, 'Suppression de session échouée'))
  })

  // --- Administration (mot de passe de l'hébergeur) ----------------------------------------------------------
  const admin = express.Router()
  admin.use((req, res, next) => {
    const k = `adminfail:${req.ip}`
    if ((hits.get(k) || []).filter((t) => Date.now() - t < 10 * 60_000).length >= 8) return res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' })
    if (!safeEqual(req.get('x-admin-password') || '', password)) {
      limited(k, 8, 10 * 60_000)
      return res.status(401).json({ error: 'Mot de passe incorrect' })
    }
    next()
  })
  admin.get('/sessions', (req, res) =>
    res.json({
      max: config.MAX_SESSIONS,
      storage: storage.name(),
      uptime: formatUptime(process.uptime()),
      sessions: sessions.list().map((s) => ({ id: s.id, status: s.state.status, number: s.state.user ? s.state.user.split('@')[0].split(':')[0] : null, since: formatUptime((Date.now() - s.state.startedAt) / 1000) })),
    })
  )
  admin.delete('/sessions/:id', (req, res) => {
    if (!sessions.get(req.params.id)) return res.status(404).json({ error: 'Introuvable' })
    sessions.destroy(req.params.id).catch((err) => logger.error({ err }, 'Suppression de session échouée'))
    res.json({ ok: true })
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

    api.get('/status', (req, res) => res.json({ sessions: sessions.count(), open: sessions.list().filter((s) => s.state.status === 'open').length }))

    api.post('/send', async (req, res) => {
      // Envoi depuis le compte de l'opérateur (variable OWNER) s'il est connecté, sinon le premier compte connecté
      const open = sessions.list().filter((s) => s.state.status === 'open' && s.sock)
      const session = open.find((s) => config.OWNER.includes(String(s.state.user).split('@')[0].split(':')[0])) || open[0]
      const sock = session?.sock
      if (!sock) return res.status(503).json({ error: 'Bot non connecté' })
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
