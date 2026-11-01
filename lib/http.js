// Petits utilitaires HTTP (fetch natif de Node ≥ 18)

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function request(url, opts = {}) {
  const { timeout = 30_000, headers = {}, ...rest } = opts
  const res = await fetch(url, {
    ...rest,
    headers: { 'user-agent': UA, ...headers },
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${new URL(url).host}`)
  return res
}

const getJson = async (url, opts) => (await request(url, opts)).json()
const getText = async (url, opts) => (await request(url, opts)).text()
const getBuffer = async (url, opts) => Buffer.from(await (await request(url, opts)).arrayBuffer())

// POST JSON, réponse JSON
const postJson = async (url, body, opts = {}) =>
  (
    await request(url, {
      method: 'POST',
      ...opts,
      headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
      body: JSON.stringify(body),
    })
  ).json()

const isUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim())
const findUrls = (s) => String(s || '').match(/https?:\/\/[^\s]+/gi) || []

module.exports = { request, getJson, getText, getBuffer, postJson, isUrl, findUrls, UA }
