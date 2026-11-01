const { bot, db, config, http } = require('../lib')

// IA : gpt · dall · gemini · groq · or · bing · lydia
// Les modèles sont surchargeables par variables d'environnement (voir .env.example).
const K = config.KEYS
const SYSTEM = process.env.AI_SYSTEM_MSG || 'Tu es Shadow Bot, un assistant WhatsApp utile et concis. Réponds dans la langue de l\'utilisateur.'
const need = (m, key, name, url) => (key ? false : (m.reply(`⚠️ Clé ${name} manquante.\nObtenez-en une : ${url}\nPuis ajoutez-la dans vos variables d'environnement (ou : setvar ${name} = …).`), true))

async function post(url, headers, body, timeout = 90_000) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error?.message || json.message || `HTTP ${res.status}`)
  return json
}

// Chat compatible OpenAI (OpenAI, Groq, OpenRouter)
const compat = (url, key, model, extra = {}) => async (history, image) => {
  const msgs = history.map((h) => ({ ...h }))
  if (image) {
    const last = msgs[msgs.length - 1]
    last.content = [{ type: 'text', text: last.content }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image.toString('base64')}` } }]
  }
  const r = await post(url, { authorization: `Bearer ${key}`, ...extra }, { model, messages: [{ role: 'system', content: SYSTEM }, ...msgs] })
  return r.choices?.[0]?.message?.content?.trim() || 'Pas de réponse.'
}

const providers = {
  openai: () => compat('https://api.openai.com/v1/chat/completions', K.OPENAI, process.env.OPENAI_MODEL || 'gpt-4o-mini'),
  groq: () => compat('https://api.groq.com/openai/v1/chat/completions', K.GROQ, process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'),
  openrouter: () => compat('https://openrouter.ai/api/v1/chat/completions', K.OPENROUTER, process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free'),
  gemini: () => async (history, image, { search = false } = {}) => {
    const contents = history.map((h, i) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }, ...(image && i === history.length - 1 ? [{ inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } }] : [])],
    }))
    const body = { systemInstruction: { parts: [{ text: SYSTEM }] }, contents }
    if (search) body.tools = [{ google_search: {} }]
    const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`, { 'x-goog-api-key': K.GEMINI }, body)
    return r.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('').trim() || 'Pas de réponse (contenu refusé ?).'
  },
}
// Getters : une clé ajoutée avec setvar est prise en compte sans redémarrage
const keyOf = { get openai() { return K.OPENAI }, get groq() { return K.GROQ }, get openrouter() { return K.OPENROUTER }, get gemini() { return K.GEMINI } }

const SETUP = {
  openai: ['OPENAI_API_KEY', 'https://platform.openai.com/api-keys'],
  groq: ['GROQ_API_KEY', 'https://console.groq.com/keys'],
  openrouter: ['OPENROUTER_API_KEY', 'https://openrouter.ai/keys'],
  gemini: ['GEMINI_API_KEY', 'https://aistudio.google.com/app/apikey'],
}

function direct(name, provider, label) {
  bot({ name, desc: `Discuter avec ${label}${provider === 'openai' || provider === 'gemini' ? ' (image possible : répondre à une image)' : ''}`, type: 'ia' }, async (m, match) => {
    const text = match || m.quoted?.text
    if (!text) return m.reply(`Exemple : ${name} Quelle est la capitale de la France ?`)
    if (need(m, keyOf[provider], ...SETUP[provider])) return
    const image = m.quoted && m.mediaType === 'image' && ['openai', 'gemini'].includes(provider) ? await m.downloadMedia() : null
    try {
      await m.reply(await providers[provider]()([{ role: 'user', content: text }], image))
    } catch (e) {
      await m.reply(`❌ ${label} : ${e.message}`)
    }
  })
}
direct('gpt', 'openai', 'ChatGPT')
direct('gemini', 'gemini', 'Google Gemini')
direct('groq', 'groq', 'Groq')
direct('or', 'openrouter', 'OpenRouter')

// dall : génération d'image (OpenAI)
bot({ name: 'dall', desc: 'Génère une image par IA (dall un chat siamois en studio)', type: 'ia' }, async (m, match) => {
  if (!match) return m.reply('Exemple : dall un chat siamois, portrait studio, lumière douce')
  if (need(m, K.OPENAI, ...SETUP.openai)) return
  await m.react('⏳')
  try {
    const r = await post('https://api.openai.com/v1/images/generations', { authorization: `Bearer ${K.OPENAI}` }, { model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt: match, size: '1024x1024', n: 1 }, 180_000)
    const d = r.data?.[0]
    if (d?.b64_json) await m.sendMedia(Buffer.from(d.b64_json, 'base64'), { type: 'image', caption: match.slice(0, 200) })
    else if (d?.url) await m.sendMedia(d.url, { type: 'image', caption: match.slice(0, 200) })
    else throw new Error('Aucune image renvoyée')
    await m.react('✅')
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
})

// bing : réponse appuyée sur une recherche web (Gemini + Google Search — l'API privée de Bing n'existe pas)
bot({ name: 'bing', desc: 'Question avec recherche web en direct (bing qui a gagné le dernier match ?)', type: 'ia' }, async (m, match) => {
  const text = match || m.quoted?.text
  if (!text) return m.reply('Exemple : bing prix du bitcoin aujourd\'hui')
  if (need(m, K.GEMINI, ...SETUP.gemini)) return
  try {
    await m.reply(await providers.gemini()([{ role: 'user', content: text }], null, { search: true }))
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
})

// --- lydia : chatbot qui répond quand on lui répond ou qu'on le mentionne --------------
//   lydia on | off          pour tout le chat
//   lydia on @membre        (ou en répondant à un message) uniquement pour cette personne
const lydia = () => db.get('global', 'lydia', {})
const history = new Map() // `${chat}:${user}` -> [{role, content}]
const pickProvider = () => (process.env.AI_PROVIDER && keyOf[process.env.AI_PROVIDER] ? process.env.AI_PROVIDER : Object.keys(keyOf).find((k) => keyOf[k]))

bot({ name: 'lydia', desc: 'Chatbot IA : lydia on|off (tout le chat) · lydia on @membre', type: 'ia' }, async (m, match) => {
  const arg = match.split(/\s+/)[0]?.toLowerCase()
  if (!['on', 'off'].includes(arg)) return m.reply('Exemple : lydia on | off\n_Répondez à un message ou mentionnez quelqu\'un pour l\'activer pour une seule personne._')
  if (!pickProvider()) return m.reply('⚠️ Aucune clé IA configurée (GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY ou OPENAI_API_KEY).')
  const user = m.mentioned[0] || m.quoted?.sender
  const all = lydia()
  const cur = all[m.jid] || { all: false, users: [] }
  if (user) cur.users = arg === 'on' ? [...new Set([...cur.users, user])] : cur.users.filter((u) => u !== user)
  else cur.all = arg === 'on'
  all[m.jid] = cur
  db.set('global', 'lydia', all)
  await m.reply(`_Lydia ${arg === 'on' ? 'activée' : 'désactivée'}${user ? ' pour cette personne' : ''}._\n_Elle répond uniquement quand on lui répond ou qu'on la mentionne._`)
})

bot({ on: 'message' }, async (m, ctx) => {
  if (m.fromMe || !m.text || m.text.startsWith(ctx.PREFIX)) return
  const cfg = lydia()[m.jid]
  if (!cfg || (!cfg.all && !cfg.users.includes(m.sender))) return
  const me = [m.sock.user?.id, m.sock.user?.lid].filter(Boolean).map((j) => j.split(':')[0].split('@')[0])
  const mentionsMe = m.mentioned.some((j) => me.includes(j.split(':')[0].split('@')[0]))
  const repliesToMe = m.quoted?.sender && me.includes(m.quoted.sender.split(':')[0].split('@')[0])
  if (!mentionsMe && !repliesToMe) return
  const p = pickProvider()
  if (!p) return
  const hk = `${m.jid}:${m.sender}`
  const h = history.get(hk) || []
  h.push({ role: 'user', content: m.text })
  try {
    const reply = await providers[p]()(h.slice(-8))
    h.push({ role: 'assistant', content: reply })
    history.set(hk, h.slice(-8))
    await m.reply(reply)
  } catch {
    h.pop()
  }
})
