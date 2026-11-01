const cheerio = require('cheerio')
const translate = require('google-translate-api-x')
const gtts = require('google-tts-api')
const { bot, http, config, ffmpeg: ff, dl } = require('../lib')

const LANG = process.env.LANG_CODE || 'fr'

// trt <langue> [texte] — texte pris sur le message cité si absent
bot({ name: 'trt', desc: 'Traduction (trt en en répondant à un texte · trt fr Hello)', type: 'outils' }, async (m, match) => {
  const [first, ...rest] = match.split(/\s+/)
  const hasLang = /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(first || '')
  const to = hasLang ? first : LANG
  const text = (hasLang ? rest.join(' ') : match) || m.quoted?.text
  if (!text) return m.reply('Exemple : trt en (en répondant à un message)\nou : trt fr Hello world')
  try {
    const r = await translate(text, { to, autoCorrect: false })
    await m.reply(r.text)
  } catch (e) {
    await m.reply(`❌ Traduction impossible : ${e.message}`)
  }
})

// tts <texte> [{langue}] → note vocale
bot({ name: 'tts', desc: 'Texte → voix (tts Bonjour {fr})', type: 'outils' }, async (m, match) => {
  let text = match || m.quoted?.text
  if (!text) return m.reply('Exemple : tts Bonjour tout le monde\nChoix de langue : tts Hello {en}')
  let lang = LANG
  const tag = text.match(/\{([a-zA-Z-]{2,5})\}/)
  if (tag) {
    lang = tag[1]
    text = text.replace(tag[0], '').trim()
  }
  const parts = await gtts.getAllAudioBase64(text.slice(0, 1000), { lang, slow: false, host: 'https://translate.google.com', timeout: 15_000 })
  const mp3 = Buffer.concat(parts.map((p) => Buffer.from(p.base64, 'base64')))
  await m.sendMedia(await ff.toOpus(mp3, 'mp3'), { type: 'audio', ptt: true })
})

// Météo : Open-Meteo (sans clé)
const WMO = { 0: 'Ciel dégagé ☀️', 1: 'Plutôt dégagé 🌤️', 2: 'Partiellement nuageux ⛅', 3: 'Couvert ☁️', 45: 'Brouillard 🌫️', 48: 'Brouillard givrant 🌫️', 51: 'Bruine légère 🌦️', 53: 'Bruine 🌦️', 55: 'Bruine forte 🌦️', 61: 'Pluie légère 🌧️', 63: 'Pluie 🌧️', 65: 'Forte pluie 🌧️', 71: 'Neige légère 🌨️', 73: 'Neige 🌨️', 75: 'Forte neige ❄️', 80: 'Averses 🌦️', 81: 'Averses fortes 🌧️', 82: 'Averses violentes ⛈️', 95: 'Orage ⛈️', 96: 'Orage avec grêle ⛈️', 99: 'Orage violent avec grêle ⛈️' }
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
bot({ name: 'weather', aliases: ['meteo', 'météo'], desc: 'Météo d\'une ville (weather Abidjan)', type: 'recherche' }, async (m, match) => {
  if (!match) return m.reply('Exemple : weather Abidjan')
  const geo = await http.getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(match)}&count=1&language=fr`)
  const p = geo.results?.[0]
  if (!p) return m.reply(`_${match} introuvable_`)
  const w = await http.getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto&wind_speed_unit=ms&forecast_days=1`)
  const c = w.current
  const hm = (iso) => iso.split('T')[1]
  await m.reply(
    `*Lieu :* ${p.name}${p.admin1 ? ', ' + p.admin1 : ''}\n*Pays :* ${p.country}\n*Temps :* ${WMO[c.weather_code] || '—'}\n*Température :* ${c.temperature_2m}°C\n*Ressenti :* ${c.apparent_temperature}°C\n*Humidité :* ${c.relative_humidity_2m}%\n*Vent :* ${c.wind_speed_10m} m/s ${DIRS[Math.round(c.wind_direction_10m / 45) % 8]}\n*Lever du soleil :* ${hm(w.daily.sunrise[0])}\n*Coucher du soleil :* ${hm(w.daily.sunset[0])}`
  )
})

// Films : OMDb (clé OMDB_API_KEY)
bot({ name: 'movie', aliases: ['film'], desc: 'Infos sur un film ou une série (movie Titre)', type: 'recherche' }, async (m, match) => {
  if (!match) return m.reply('Exemple : movie Inception')
  if (!config.KEYS.OMDB) return m.reply('⚠️ Clé OMDB_API_KEY manquante (https://www.omdbapi.com/apikey.aspx).')
  const d = await http.getJson(`https://www.omdbapi.com/?apikey=${config.KEYS.OMDB}&t=${encodeURIComponent(match)}&plot=full`)
  if (d.Response !== 'True') return m.reply('Film introuvable. Vérifiez le titre.')
  const poster = d.Poster
  const skip = new Set(['Poster', 'Response', 'Ratings', 'imdbID', 'Type'])
  const text = Object.entries(d).filter(([k, v]) => !skip.has(k) && v !== 'N/A').map(([k, v]) => `*${k} :* ${v}`).join('\n')
  if (poster && poster !== 'N/A') return m.sendMedia(poster, { type: 'image', caption: text })
  await m.reply(text)
})

// Actualités : Google Actualités (RSS, sans clé)
bot({ name: 'news', aliases: ['actu'], desc: 'Dernières actualités (news ou news sujet)', type: 'recherche' }, async (m, match) => {
  const hl = LANG
  const gl = (process.env.NEWS_COUNTRY || 'CI').toUpperCase()
  const base = match
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(match)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`
    : `https://news.google.com/rss?hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`
  const $ = cheerio.load(await http.getText(base), { xmlMode: true })
  const items = $('item').slice(0, 8).map((_, e) => `📰 *${$(e).find('title').first().text()}*\n${$(e).find('link').first().text()}`).get()
  if (!items.length) return m.reply('Aucune actualité trouvée.')
  await m.reply(items.join('\n\n'))
})

// Reddit : vidéo/image d'un post
bot({ name: 'reddit', desc: 'Télécharge la vidéo d\'un post Reddit (reddit lien)', type: 'téléchargement' }, async (m, match) => {
  const url = dl.urlIn(m, match)
  if (!url) return m.reply('Exemple : reddit https://www.reddit.com/r/…/comments/…')
  await dl.sendLink(m, url)
})

// APK : Aptoide
bot({ name: 'apk', desc: 'Télécharge une application Android (apk Mixplorer)', type: 'téléchargement' }, async (m, match) => {
  if (!match) return m.reply('Exemple : apk Mixplorer')
  const r = await http.getJson(`https://ws75.aptoide.com/api/7/apps/search?query=${encodeURIComponent(match)}&limit=5`)
  const list = r.datalist?.list || []
  const app = list[0]
  if (!app) return m.reply('Application introuvable. 🔍')
  const size = app.file?.filesize || app.size || 0
  if (size > 95 * 1024 * 1024) return m.reply(`*${app.name}* est trop lourde pour WhatsApp (${(size / 1048576).toFixed(0)} Mo).\nLien : ${app.file?.path}`)
  await m.reply(`📱 *${app.name}* ${app.file?.vername || ''}\n${(size / 1048576).toFixed(1)} Mo — envoi en cours…`)
  const buf = await http.getBuffer(app.file.path, { timeout: 180_000 })
  await m.sendMedia(buf, { type: 'document', mimetype: 'application/vnd.android.package-archive', fileName: `${app.name}.apk` })
})
