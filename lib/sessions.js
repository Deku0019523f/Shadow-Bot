// Gestionnaire multi-utilisateurs : une session = un compte WhatsApp relié = un bot indépendant
// (connexion, réglages, clés, filtres... séparés). Les sessions sont créées depuis la page web publique.
const crypto = require('crypto')
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys')

const config = require('../config')
const ctx = require('./context')
const db = require('./db')
const logger = require('./logger')
const groups = require('./groups')
const handler = require('./handler')
const registry = require('./registry')
const stateLib = require('./state')
const { useDbAuthState } = require('./authstate')
const branding = require('./branding')
const { norm, digits, sleep } = require('./utils')

const LINK_TTL_MS = 10 * 60_000 // une liaison (QR / code) non terminée est abandonnée après 10 min
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')

// --- Registre persistant des sessions -------------------------------------------------------------------------
// { [id]: { createdAt, tokenHash, number, everLinked, welcomed } }
const readReg = () => db.get('sys:sessions', 'all', {})
const patchMeta = (id, patch) => {
  const reg = readReg()
  if (reg[id]) db.set('sys:sessions', 'all', { ...reg, [id]: { ...reg[id], ...patch } })
}

const sessions = new Map() // id -> Session

class Session {
  constructor(id) {
    this.id = id
    this.state = stateLib.create()
    this.sock = null
    this.auth = null
    this.gen = 0
    this.retries = 0
    this.tickTimer = null
    this.linkStartedAt = Date.now()
    this.stopped = false
  }

  get meta() {
    return readReg()[this.id] || {}
  }

  // Exécute fn dans le contexte de cette session (db, state, process.env propres à l'utilisateur)
  run(fn) {
    return ctx.run(this, fn)
  }

  async start() {
    if (this.stopped) return
    const myGen = ++this.gen
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners()
        this.sock.end(undefined)
      } catch {}
    }

    this.auth = await useDbAuthState(this.id)
    const { version } = await fetchLatestBaileysVersion()
    this.state.set({ status: 'connecting', qr: null })

    const s = makeWASocket({
      version,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: this.auth.state.creds,
        keys: makeCacheableSignalKeyStore(this.auth.state.keys, logger),
      },
      markOnlineOnConnect: false,
      syncFullHistory: false,
      cachedGroupMetadata: async (jid) => groups.peek(jid),
    })
    this.sock = s
    const alive = () => myGen === this.gen && !this.stopped
    // Toute écoute s'exécute dans le contexte de la session
    const on = (event, fn) => s.ev.on(event, (...a) => alive() && this.run(() => fn(...a)))

    on('creds.update', () => this.auth.saveCreds().catch((err) => logger.error({ err }, 'Sauvegarde de session échouée')))

    on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr && !s.authState.creds.registered) this.state.set({ status: 'qr', qr })

      if (connection === 'open') {
        this.retries = 0
        const me = norm(s.user.id)
        const number = digits(me)
        const dup = [...sessions.values()].find((o) => o !== this && o.state.user && digits(o.state.user) === number)
        if (dup) {
          // Ce numéro est déjà relié à une autre session : on abandonne celle-ci
          this.state.set({ status: 'duplicate', qr: null, pairingCode: null })
          console.log(`⚠️  ${number} déjà relié (session ${dup.id}) : session ${this.id} ignorée.`)
          return manager.stop(this, 'duplicate')
        }
        this.state.set({ status: 'open', qr: null, pairingCode: null, user: me })
        console.log(`✅ [${this.id}] connecté en tant que ${number}`)
        const first = !this.meta.welcomed
        patchMeta(this.id, { number, everLinked: true, welcomed: true })
        if (first) this.welcome(me).catch(() => {})
        handler.emit(s, 'ready', s).catch(() => {})
        this.startTick()
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        this.state.set({ user: null })
        this.stopTick()

        if (code === DisconnectReason.loggedOut) {
          // Déconnecté depuis le téléphone : la session WhatsApp est invalide, les réglages sont conservés
          console.log(`🚪 [${this.id}] déconnecté depuis WhatsApp.`)
          await this.auth.clear().catch(() => {})
          patchMeta(this.id, { welcomed: false })
          return this.halt('logged_out')
        }
        if (code === DisconnectReason.connectionReplaced) {
          console.log(`⚠️  [${this.id}] session ouverte ailleurs.`)
          return this.halt('logged_out')
        }

        this.retries += 1
        const delay = code === DisconnectReason.restartRequired ? 0 : Math.min(30_000, this.retries * 3_000)
        logger.warn({ id: this.id, code, retries: this.retries }, 'Connexion fermée, nouvelle tentative')
        this.state.set({ status: 'connecting', qr: null })
        await sleep(delay)
        if (alive()) this.run(() => this.start()).catch((err) => logger.error({ err }, 'Reconnexion échouée'))
      }
    })

    on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      for (const raw of messages) handler.onMessage(s, raw).catch((err) => logger.error({ err }, 'Erreur handler message'))
    })
    on('group-participants.update', (event) => handler.emit(s, 'participants', event).catch((err) => logger.error({ err }, 'Erreur participants')))
    on('messages.update', (updates) => handler.emit(s, 'update', updates).catch((err) => logger.error({ err }, 'Erreur update')))
    on('call', (calls) => handler.emit(s, 'call', calls).catch((err) => logger.error({ err }, 'Erreur call')))
    on('groups.update', (updates) => {
      for (const u of updates) if (u.id) groups.invalidate(u.id)
    })
    return s
  }

  // Arrête le socket sans supprimer la session (état « déconnecté » : l'utilisateur peut se reconnecter)
  halt(status = 'logged_out') {
    this.gen++
    this.stopTick()
    try {
      this.sock?.ev.removeAllListeners()
      this.sock?.end(undefined)
    } catch {}
    this.sock = null
    this.state.set({ status, qr: null, pairingCode: null, user: null })
  }

  // Relance une liaison (QR / code) pour une session déconnectée
  async relink() {
    this.linkStartedAt = Date.now()
    return this.run(() => this.start())
  }

  startTick() {
    if (this.tickTimer) return
    this.tickTimer = setInterval(() => {
      if (this.sock && this.state.status === 'open') this.run(() => handler.emit(this.sock, 'tick', this.sock)).catch(() => {})
    }, 30_000)
    this.tickTimer.unref?.()
  }

  stopTick() {
    clearInterval(this.tickTimer)
    this.tickTimer = null
  }

  async waitForQr(timeoutMs) {
    const t0 = Date.now()
    while (this.state.status !== 'qr') {
      if (this.state.status === 'open') throw new Error('Ce compte est déjà connecté.')
      if (Date.now() - t0 > timeoutMs) throw new Error("WhatsApp n'est pas prêt, réessayez dans quelques secondes.")
      await sleep(300)
    }
  }

  // Mode « code de jumelage » : renvoie un code à saisir dans WhatsApp > Appareils connectés
  async requestPairing(number) {
    const n = digits(number)
    if (n.length < 7 || n.length > 15) throw new Error('Numéro invalide (format international, sans + ni espaces).')
    if (!this.sock) throw new Error('Connexion non initialisée.')
    if (this.sock.authState.creds.registered) throw new Error('Un compte est déjà enregistré.')
    await this.waitForQr(15_000)
    const raw = await this.sock.requestPairingCode(n)
    const code = raw.match(/.{1,4}/g)?.join('-') || raw
    this.state.set({ pairingCode: code, pairingNumber: n, pairingAt: Date.now() })
    return code
  }

  // Message de bienvenue envoyé au propriétaire à la première liaison (logo + résumé personnalisé)
  async welcome(me) {
    const s = this.sock
    const prefix = db.get('global', 'prefix', config.PREFIX)
    const name = s.user?.name || 'Utilisateur'
    const mode = db.get('global', 'mode', config.MODE) === 'private' ? 'Privé (propriétaire uniquement)' : 'Public (ouvert à tous)'
    const count = registry.all().filter((c) => !c.hidden && !c.platform).length
    const when = new Date().toLocaleString('fr-FR', { timeZone: process.env.TZ || 'Africa/Abidjan', dateStyle: 'full', timeStyle: 'short' })
    const text = [
      `🌑 *${config.BOT_NAME.toUpperCase()}* — connexion réussie`,
      '',
      `Bienvenue *${name}* 👋`,
      'Votre compte WhatsApp est maintenant relié à votre bot personnel.',
      '',
      '*📋 Informations*',
      `• *Numéro* : +${digits(me)}`,
      `• *Version* : ${config.VERSION}`,
      `• *Mode* : ${mode}`,
      `• *Préfixe* : ${prefix}`,
      `• *Commandes* : ${count}`,
      `• *Connecté le* : ${when}`,
      '',
      '*🚀 Pour commencer*',
      `• *${prefix}menu* — liste complète des commandes`,
      `• *${prefix}menu groupe* — une catégorie précise`,
      `• *${prefix}ping* — vérifier la réactivité`,
      `• *${prefix}vv* — récupérer un média « vue unique » (en réponse)`,
      '',
      '*⚙️ Personnalisation*',
      `• *${prefix}setvar CLÉ = valeur* — ajouter vos propres clés (IA, météo…) : elles ne servent qu'à vous`,
      `• *${prefix}mode private* / *${prefix}mode public* — qui peut utiliser votre bot`,
      '',
      "_Ce message n'est visible que par vous. Vos réglages sont indépendants de ceux des autres utilisateurs._",
    ].join('\n')
    await branding.sendWithLogo(s, me, text)
  }
}

// --- Gestionnaire ---------------------------------------------------------------------------------------------
const manager = {
  count: () => sessions.size,
  get: (id) => sessions.get(id) || null,
  list: () => [...sessions.values()],

  // Session de l'utilisateur dont le code s'exécute (contexte)
  current: () => ctx.session(),

  // Vérifie le jeton secret donné à l'utilisateur à la création
  verify(id, token) {
    const meta = readReg()[id]
    const s = sessions.get(id)
    if (!meta || !s || !token) return null
    const a = Buffer.from(sha(token))
    const b = Buffer.from(meta.tokenHash)
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? s : null
  },

  // Crée une session vide, en attente de liaison. Renvoie { session, token } (le jeton n'est montré qu'une fois).
  async create() {
    if (sessions.size >= config.MAX_SESSIONS) throw Object.assign(new Error('Le serveur a atteint le nombre maximum de comptes reliés. Réessayez plus tard.'), { status: 503 })
    const id = crypto.randomBytes(5).toString('hex')
    const token = crypto.randomBytes(24).toString('hex')
    db.set('sys:sessions', 'all', { ...readReg(), [id]: { createdAt: Date.now(), tokenHash: sha(token), number: null, everLinked: false, welcomed: false } })
    const session = new Session(id)
    sessions.set(id, session)
    session.run(() => session.start()).catch((err) => logger.error({ err }, 'Démarrage de session échoué'))
    return { session, token }
  },

  // Arrête une session : socket fermé. `reason` 'duplicate' / 'expired' → les données sont supprimées.
  stop(session, reason) {
    session.halt(reason === 'duplicate' ? 'duplicate' : 'logged_out')
    if (reason === 'duplicate' || reason === 'expired') setTimeout(() => manager.destroy(session.id, { logout: false }), 60_000).unref?.()
  },

  // Supprime complètement une session : déconnexion WhatsApp, clés, réglages.
  async destroy(id, { logout = true } = {}) {
    const session = sessions.get(id)
    if (session) {
      session.stopped = true
      session.gen++
      session.stopTick()
      try {
        if (logout) await session.sock?.logout()
      } catch {}
      try {
        session.sock?.ev.removeAllListeners()
        session.sock?.end(undefined)
      } catch {}
      await session.auth?.clear().catch(() => {})
      sessions.delete(id)
    } else {
      await (await useDbAuthState(id)).clear().catch(() => {})
    }
    db.dropSession(id)
    const reg = { ...readReg() }
    delete reg[id]
    db.set('sys:sessions', 'all', reg)
  },

  // Au démarrage du serveur : relance les sessions déjà liées (échelonnées pour limiter la charge)
  async restoreAll() {
    const reg = readReg()
    let n = 0
    for (const [id, meta] of Object.entries(reg)) {
      if (!meta.everLinked) {
        await manager.destroy(id, { logout: false })
        continue
      }
      const session = new Session(id)
      sessions.set(id, session)
      session.run(() => session.start()).catch((err) => logger.error({ err }, 'Restauration de session échouée'))
      n++
      await sleep(1500)
    }
    return n
  },

  // Nettoyage périodique : abandonne les liaisons restées sans suite
  sweep() {
    for (const s of [...sessions.values()]) {
      const registered = !!s.sock?.authState?.creds?.registered
      const waiting = ['qr', 'connecting', 'starting'].includes(s.state.status) && !s.state.user && !registered
      if (!waiting || Date.now() - s.linkStartedAt < LINK_TTL_MS) continue
      if (s.meta.everLinked) s.halt('logged_out')
      else manager.destroy(s.id, { logout: false }).catch(() => {})
    }
  },

  async closeAll() {
    for (const s of sessions.values()) {
      s.stopped = true
      s.stopTick()
      try {
        s.sock?.end(undefined)
      } catch {}
    }
  },
}

setInterval(() => manager.sweep(), 60_000).unref?.()

module.exports = manager
