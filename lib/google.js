// OAuth Google (application « ordinateur ») + appels d'API (Drive, Calendar, Tasks)
// Flux : gauth auth -> lien -> l'utilisateur colle l'URL de redirection (gauth code …) -> jetons stockés en base.
const config = require('../config')
const db = require('./db')

const REDIRECT = 'http://localhost'
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
]
const cred = () => ({ id: config.KEYS.GOOGLE_CLIENT_ID, secret: config.KEYS.GOOGLE_CLIENT_SECRET })
const hasClient = () => !!(cred().id && cred().secret)
const token = () => db.get('global', 'gtoken', null)
const isAuthed = () => !!token()?.refresh

function authUrl() {
  const p = new URLSearchParams({ client_id: cred().id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent' })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function tokenCall(params) {
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: cred().id, client_secret: cred().secret, ...params }), signal: AbortSignal.timeout(30_000) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error_description || j.error || `HTTP ${res.status}`)
  return j
}

async function exchange(input) {
  const code = /[?&]code=/.test(input) ? new URL(input.trim()).searchParams.get('code') : input.trim()
  if (!code) throw new Error('Code introuvable')
  const j = await tokenCall({ code, redirect_uri: REDIRECT, grant_type: 'authorization_code' })
  db.set('global', 'gtoken', { access: j.access_token, refresh: j.refresh_token || token()?.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 })
}

async function accessToken() {
  const t = token()
  if (!t?.refresh) throw new Error('Google non connecté : utilisez « gauth auth ».')
  if (t.access && t.exp > Date.now()) return t.access
  const j = await tokenCall({ refresh_token: t.refresh, grant_type: 'refresh_token' })
  db.set('global', 'gtoken', { ...t, access: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 })
  return j.access_token
}

// api('GET', url) -> JSON ; opts.json (corps JSON) · opts.body + opts.headers (brut) · opts.buffer (réponse binaire)
async function api(method, url, opts = {}) {
  const headers = { authorization: `Bearer ${await accessToken()}`, ...(opts.headers || {}) }
  let body = opts.body
  if (opts.json) { headers['content-type'] = 'application/json'; body = JSON.stringify(opts.json) }
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(opts.timeout || 60_000) })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new Error(j.error?.message || `Google HTTP ${res.status}`)
  }
  if (opts.buffer) return Buffer.from(await res.arrayBuffer())
  return res.status === 204 ? null : res.json()
}

const logout = () => db.del('global', 'gtoken')
module.exports = { authUrl, exchange, api, hasClient, isAuthed, logout, REDIRECT }
