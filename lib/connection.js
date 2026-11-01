const qrcodeTerminal = require('qrcode-terminal')
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys')

const config = require('../config')
const logger = require('./logger')
const groups = require('./groups')
const handler = require('./handler')
const state = require('./state')
const { useDbAuthState } = require('./authstate')
const { norm, digits, sleep } = require('./utils')
const { sendWithLogo } = require('./branding')
const registry = require('./registry')

let sock = null
let auth = null
let gen = 0 // identifiant de la génération de socket : les événements d'un vieux socket sont ignorés
let stopping = false
let retries = 0
let tickTimer = null
let autoPairDone = false

async function start() {
  const myGen = ++gen
  if (sock) {
    try {
      sock.ev.removeAllListeners()
      sock.end(undefined)
    } catch {}
  }

  auth = await useDbAuthState()
  const { version } = await fetchLatestBaileysVersion()
  state.set({ status: 'connecting', qr: null })

  const s = makeWASocket({
    version,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: auth.state.creds,
      keys: makeCacheableSignalKeyStore(auth.state.keys, logger),
    },
    markOnlineOnConnect: false,
    syncFullHistory: false,
    cachedGroupMetadata: async (jid) => groups.peek(jid),
  })
  sock = s

  const alive = () => myGen === gen

  s.ev.on('creds.update', () => {
    if (alive()) auth.saveCreds().catch((err) => logger.error({ err }, 'Sauvegarde de session échouée'))
  })

  s.ev.on('connection.update', async (update) => {
    if (!alive()) return
    const { connection, lastDisconnect, qr } = update

    if (qr && !s.authState.creds.registered) {
      state.set({ status: 'qr', qr })

      // Jumelage automatique si PAIRING_NUMBER est défini
      if (config.PAIRING_NUMBER && !autoPairDone) {
        autoPairDone = true
        try {
          const code = await requestPairing(config.PAIRING_NUMBER)
          console.log(`\n🔑 Code de jumelage : ${code}\n   WhatsApp > Appareils connectés > Connecter avec le numéro de téléphone\n`)
        } catch (err) {
          logger.error({ err }, 'Jumelage automatique échoué')
        }
      } else if (process.stdout.isTTY && !config.PAIRING_NUMBER) {
        console.log('\n📱 Scannez ce QR code (ou utilisez la page web) :\n')
        qrcodeTerminal.generate(qr, { small: true })
      }
    }

    if (connection === 'open') {
      retries = 0
      autoPairDone = false
      const me = norm(s.user.id)
      state.set({ status: 'open', qr: null, pairingCode: null, user: me })
      console.log(`✅ ${config.BOT_NAME} connecté en tant que ${me}`)
      sendWelcome(s, me).catch(() => {})
      handler.emit(s, 'ready', s).catch(() => {})
      startTick()
    }

    if (connection === 'close') {
      if (stopping) return
      const code = lastDisconnect?.error?.output?.statusCode
      state.set({ user: null })

      if (code === DisconnectReason.loggedOut) {
        console.log('🚪 Session déconnectée depuis WhatsApp : nouvelle connexion nécessaire.')
        await auth.clear().catch(() => {})
        state.set({ status: 'logged_out', qr: null, pairingCode: null })
        await sleep(1000)
        autoPairDone = false
        return start().catch((err) => logger.error({ err }, 'Redémarrage échoué'))
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log('⚠️  Session ouverte ailleurs (connexion remplacée). Arrêt des tentatives.')
        state.set({ status: 'logged_out' })
        return
      }

      retries += 1
      const delay = code === DisconnectReason.restartRequired ? 0 : Math.min(30_000, retries * 3_000)
      logger.warn({ code, retries }, 'Connexion fermée, nouvelle tentative')
      state.set({ status: 'connecting', qr: null })
      await sleep(delay)
      if (alive()) start().catch((err) => logger.error({ err }, 'Reconnexion échouée'))
    }
  })

  s.ev.on('messages.upsert', ({ messages, type }) => {
    if (!alive() || type !== 'notify') return
    for (const raw of messages) {
      handler.onMessage(s, raw).catch((err) => logger.error({ err }, 'Erreur handler message'))
    }
  })

  s.ev.on('group-participants.update', (event) => {
    if (alive()) handler.emit(s, 'participants', event).catch((err) => logger.error({ err }, 'Erreur participants'))
  })

  s.ev.on('messages.update', (updates) => {
    if (alive()) handler.emit(s, 'update', updates).catch((err) => logger.error({ err }, 'Erreur update'))
  })

  s.ev.on('call', (calls) => {
    if (alive()) handler.emit(s, 'call', calls).catch((err) => logger.error({ err }, 'Erreur call'))
  })

  s.ev.on('groups.update', (updates) => {
    for (const u of updates) if (u.id) groups.invalidate(u.id)
  })

  return s
}

// Message de bienvenue envoyé au propriétaire à chaque connexion (logo + résumé personnalisé)
async function sendWelcome(s, me) {
  const db = require('./db')
  const prefix = handlerPrefix()
  const name = s.user?.name || 'Utilisateur'
  const mode = db.get('global', 'mode', config.MODE) === 'private' ? 'Privé (propriétaire uniquement)' : 'Public (ouvert à tous)'
  const count = registry.all().filter((c) => !c.hidden).length
  const when = new Date().toLocaleString('fr-FR', { timeZone: process.env.TZ || 'Africa/Abidjan', dateStyle: 'full', timeStyle: 'short' })
  const text = [
    `🌑 *${config.BOT_NAME.toUpperCase()}* — connexion réussie`,
    '',
    `Bienvenue *${name}* 👋`,
    `Votre compte WhatsApp est maintenant relié à votre bot.`,
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
    `• *${prefix}setvar CLÉ = valeur* — configurer vos clés (IA, météo…) sans toucher au serveur`,
    `• *${prefix}mode private* / *${prefix}mode public* — qui peut utiliser le bot`,
    '',
    '_Ce message n\'est visible que par vous._',
  ].join('\n')
  await sendWithLogo(s, me, text)
}

const handlerPrefix = () => require('./db').get('global', 'prefix', config.PREFIX)

// Tâche périodique (rappels, messages programmés...) — écouteurs { on: 'tick' }
function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    if (sock && state.status === 'open') handler.emit(sock, 'tick', sock).catch(() => {})
  }, 30_000)
  tickTimer.unref?.()
}

async function waitForQr(timeoutMs) {
  const t0 = Date.now()
  while (state.status !== 'qr') {
    if (state.status === 'open') throw new Error('Le bot est déjà connecté.')
    if (Date.now() - t0 > timeoutMs) throw new Error("WhatsApp n'est pas prêt, réessayez dans quelques secondes.")
    await sleep(300)
  }
}

// Mode "code de jumelage" : renvoie un code à saisir dans WhatsApp > Appareils connectés
async function requestPairing(number) {
  const n = digits(number)
  if (n.length < 7) throw new Error('Numéro invalide (format international, sans + ni espaces).')
  if (!sock) throw new Error('Connexion non initialisée.')
  if (sock.authState.creds.registered) throw new Error('Un compte est déjà enregistré. Déconnectez-le d\'abord.')
  await waitForQr(15_000)

  const raw = await sock.requestPairingCode(n)
  const code = raw.match(/.{1,4}/g)?.join('-') || raw
  state.set({ pairingCode: code, pairingNumber: n, pairingAt: Date.now() })
  return code
}

// Déconnecte le compte WhatsApp et repart sur une nouvelle session (QR / code de jumelage)
async function logout() {
  gen++ // invalide les événements de l'ancien socket
  try {
    await sock?.logout()
  } catch {}
  await auth?.clear().catch(() => {})
  state.set({ status: 'logged_out', qr: null, pairingCode: null, user: null })
  autoPairDone = false
  await sleep(500)
  await start()
}

async function close() {
  stopping = true
  gen++
  clearInterval(tickTimer)
  try {
    sock?.end(undefined)
  } catch {}
}

module.exports = { start, close, logout, requestPairing, getSock: () => sock }
