const config = require('../config')
const registry = require('./registry')
const db = require('./db')
const groups = require('./groups')
const events = require('./events')
const store = require('./store')
const logger = require('./logger')
const { Message } = require('./message')
const { jidNum, norm } = require('./utils')

// Numéros « opérateur » (hébergeur du bot) : seuls leurs comptes peuvent utiliser les commandes serveur
const operators = config.OWNER

const currentMode = () => db.get('global', 'mode', config.MODE)

// PREFIX peut être modifié à chaud (commande setprefix) : db > env
const currentPrefix = () => db.get('global', 'prefix', config.PREFIX)

const buildCtx = (sock) => ({
  sock,
  PREFIX: currentPrefix(),
  config,
  db,
  commands: registry.all(),
})

async function safe(label, fn) {
  try {
    await fn()
  } catch (err) {
    logger.error({ err, label }, 'Erreur dans un plugin')
  }
}

async function onMessage(sock, raw) {
  const jid = raw.key?.remoteJid
  if (!raw.message || !jid) return
  if (jid === 'status@broadcast') return emit(sock, 'status', raw)
  if (jid.endsWith('@newsletter')) return

  store.put(raw)

  const m = new Message(sock, raw)
  // Chaque utilisateur est propriétaire de SON bot (le compte relié) ; l'opérateur l'est aussi de la partie serveur.
  const ownIds = [sock.user?.id, sock.user?.lid].filter(Boolean).map(norm)
  m.isOwner = m.fromMe || m.senderIds.some((id) => ownIds.includes(id))
  const operatorSession = operators.includes(jidNum(sock.user?.id))
  m.isOperator = m.isOwner && operatorSession
  const ctx = buildCtx(sock)

  if (operatorSession) events.emit('message', m) // webhook / API : uniquement la session de l'opérateur

  // 1) Écouteurs passifs (antilink, filtres, etc.)
  for (const l of registry.listeners('message')) {
    await safe(`listener:${l.name || 'message'}`, () => l.handler(m, ctx))
  }

  // 2) Commandes
  const prefix = ctx.PREFIX
  if (!m.text.startsWith(prefix)) return

  const parsed = m.text.slice(prefix.length).trim().match(/^(\S+)\s*([\s\S]*)$/)
  if (!parsed) return
  const cmd = registry.find(parsed[1])
  if (!cmd) return
  const match = parsed[2].trim()

  // Mode privé : seul le propriétaire, sauf commandes autorisées pour ce chat (zushi / yami / ope)
  if (currentMode() === 'private' && !m.isOwner && !(db.get('global', 'allowed', {})[m.jid] || []).includes(cmd.name)) return

  // Commandes désactivées avec `tog <cmd> off` (la commande tog reste toujours utilisable)
  if (cmd.name !== 'tog' && db.get('global', 'disabled', []).includes(cmd.name)) return

  if (cmd.platform && !m.isOperator) return m.reply('⛔ Commande réservée à l\'administrateur du serveur.')
  if (cmd.owner && !m.isOwner) return m.reply('⛔ Commande réservée au propriétaire du bot.')
  if (cmd.onlyGroup && !m.isGroup) return m.reply('👥 Cette commande fonctionne uniquement dans un groupe.')
  if (cmd.onlyPm && m.isGroup) return m.reply('💬 Cette commande fonctionne uniquement en privé.')

  if (cmd.admin || cmd.botAdmin) {
    const info = await m.groupInfo()
    if (!info) return m.reply('👥 Cette commande fonctionne uniquement dans un groupe.')
    if (cmd.admin && !info.isAdmin && !m.isOwner) return m.reply('⛔ Réservé aux admins du groupe.')
    if (cmd.botAdmin && !info.isBotAdmin) return m.reply('⚠️ Je dois être admin du groupe pour faire ça.')
  }
  if (m.isGroup) ctx.group = await m.groupInfo().catch(() => null)

  try {
    await cmd.handler(m, match, ctx)
  } catch (err) {
    logger.error({ err, command: cmd.name }, 'Erreur de commande')
    await m.reply("❌ Une erreur est survenue pendant l'exécution de la commande.").catch(() => {})
  }
}

// Événements génériques (participants, update, call, ready, tick)
async function emit(sock, event, payload) {
  if (event === 'participants') groups.invalidate(payload.id)
  const ctx = buildCtx(sock)
  for (const l of registry.listeners(event)) {
    await safe(`${event}:${l.name || ''}`, () => l.handler(payload, ctx))
  }
}

module.exports = { onMessage, emit }
