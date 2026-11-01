const {
  extractMessageContent,
  getContentType,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys')
const FileType = require('file-type')
const { norm, toJid } = require('./utils')
const groups = require('./groups')
const logger = require('./logger')

function textOf(content) {
  if (!content) return ''
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    ''
  )
}

class Message {
  constructor(sock, raw) {
    const key = raw.key
    this.sock = sock
    this.raw = raw
    this.key = key
    this.id = key.id
    this.jid = key.remoteJid
    this.isGroup = this.jid.endsWith('@g.us')
    this.fromMe = !!key.fromMe
    this.pushName = raw.pushName || ''

    const content = extractMessageContent(raw.message)
    this.content = content
    this.type = content ? getContentType(content) : null
    this.text = textOf(content).trim()

    const ctx = content?.[this.type]?.contextInfo
    this.mentioned = (ctx?.mentionedJid || []).map(norm)

    // Message cité (réponse à un message)
    this.quoted = null
    if (ctx?.quotedMessage) {
      const qContent = extractMessageContent(ctx.quotedMessage)
      this.quoted = {
        key: {
          remoteJid: this.jid,
          id: ctx.stanzaId,
          participant: ctx.participant,
          fromMe: norm(ctx.participant) === norm(sock.user?.id),
        },
        message: ctx.quotedMessage,
        content: qContent,
        type: qContent ? getContentType(qContent) : null,
        text: textOf(qContent).trim(),
        sender: norm(ctx.participant),
      }
    }

    // Expéditeur : en v7, un même utilisateur peut avoir un ID LID et un numéro.
    // On garde toutes les formes pour les comparaisons (propriétaire, admin...).
    const ids = this.isGroup ? [key.participant, key.participantAlt] : [key.remoteJid, key.remoteJidAlt]
    if (this.fromMe) ids.push(sock.user?.id, sock.user?.lid)
    this.senderIds = [...new Set(ids.filter(Boolean).map(norm))]
    this.sender = this.isGroup ? norm(key.participant || sock.user?.id) : norm(key.remoteJid)

    this.isOwner = false // renseigné par le handler
    this._group = null
  }

  // --- Envoi ---------------------------------------------------------------
  send(text, extra = {}) {
    return this.sock.sendMessage(this.jid, { text, ...extra })
  }

  reply(text, extra = {}) {
    return this.sock.sendMessage(this.jid, { text, ...extra }, { quoted: this.raw })
  }

  react(emoji) {
    return this.sock.sendMessage(this.jid, { react: { text: emoji, key: this.key } })
  }

  // Envoie un média (Buffer ou URL). type : 'image' | 'video' | 'audio' | 'sticker' | 'document'
  // (déduit du contenu si absent). Options : caption, mimetype, fileName, ptt (note vocale),
  // gif (vidéo en boucle), mentions, quoted (true = répond au message, défaut)
  async sendMedia(source, opts = {}) {
    const { caption, mimetype, fileName, ptt, gif, mentions, quoted = true } = opts
    let type = opts.type
    let payload = Buffer.isBuffer(source) ? source : { url: source }

    if (!type) {
      if (!Buffer.isBuffer(source)) throw new Error('sendMedia : "type" est requis pour une URL')
      const ft = await FileType.fromBuffer(source)
      const major = ft?.mime?.split('/')[0]
      type = ['image', 'video', 'audio'].includes(major) ? major : 'document'
    }

    const content = { [type]: payload }
    if (caption && type !== 'sticker' && type !== 'audio') content.caption = caption
    if (mimetype) content.mimetype = mimetype
    if (type === 'document') {
      content.fileName = fileName || 'fichier'
      content.mimetype ||= 'application/octet-stream'
    }
    if (type === 'audio') {
      content.ptt = !!ptt
      content.mimetype ||= ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg'
    }
    if (type === 'video' && gif) content.gifPlayback = true
    if (mentions) content.mentions = mentions
    return this.sock.sendMessage(this.jid, content, quoted ? { quoted: this.raw } : {})
  }

  sendSticker(buffer) {
    return this.sendMedia(buffer, { type: 'sticker' })
  }

  sendContent(content, opts = {}) {
    return this.sock.sendMessage(this.jid, content, opts)
  }

  deleteMessage(key = this.key) {
    return this.sock.sendMessage(this.jid, { delete: key })
  }

  // --- Cibles --------------------------------------------------------------
  // Utilisateur visé : @mention, message cité, ou numéro tapé en argument
  target(arg = '') {
    if (this.mentioned[0]) return this.mentioned[0]
    if (this.quoted?.sender) return this.quoted.sender
    return arg.replace(/\D/g, '').length >= 7 ? toJid(arg) : null
  }

  // --- Médias --------------------------------------------------------------
  // Télécharge le média du message cité, sinon celui du message courant
  async downloadMedia() {
    const src = this.quoted?.message
      ? { key: this.quoted.key, message: this.quoted.message }
      : this.raw
    return downloadMediaMessage(
      src,
      'buffer',
      {},
      { logger, reuploadRequest: this.sock.updateMediaMessage }
    )
  }

  get mediaType() {
    const t = this.quoted?.type || this.type
    return t ? t.replace('Message', '') : null // image, video, audio, sticker, document
  }

  // --- Groupe --------------------------------------------------------------
  async groupInfo() {
    if (!this.isGroup) return null
    if (this._group) return this._group
    const meta = await groups.getMeta(this.sock, this.jid)
    const botIds = [this.sock.user?.id, this.sock.user?.lid].filter(Boolean).map(norm)
    this._group = {
      meta,
      isAdmin: !!groups.adminLevel(meta, this.senderIds),
      isBotAdmin: !!groups.adminLevel(meta, botIds),
    }
    return this._group
  }
}

module.exports = { Message }
