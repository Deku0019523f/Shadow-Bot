// Retire le suffixe d'appareil ("123:12@s.whatsapp.net" -> "123@s.whatsapp.net")
const norm = (jid) => (jid ? jid.replace(/:\d+@/, '@') : jid)

const digits = (v) => String(v || '').replace(/\D/g, '')

const toJid = (n) => {
  const d = digits(n)
  return d ? `${d}@s.whatsapp.net` : null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [d && `${d}j`, h && `${h}h`, m && `${m}min`, `${s}s`].filter(Boolean).join(' ')
}

const ramUsage = () => `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} Mo`

// Numéro (ou identifiant) d'un JID : "225070000@s.whatsapp.net" -> "225070000"
const jidNum = (jid) => String(jid || '').split('@')[0].split(':')[0]

// Date/heure locales dans le fuseau TZ (défaut Africa/Abidjan) : { date: 'YYYY-MM-DD', hour, minute }
const TZ = process.env.TZ || 'Africa/Abidjan'
function localParts(date = new Date(), tz = TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value])
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) }
}

// "21:05" -> "09:05 PM"
const to12h = (h, m) => `${String(((Number(h) + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${Number(h) >= 12 ? 'PM' : 'AM'}`

// Remplace &clé par sa valeur : fill('Salut &mention', { mention: '@1' })
const fill = (tpl, vars) => String(tpl).replace(/&(\w+)/g, (all, k) => (vars[k] !== undefined ? vars[k] : all))

module.exports = { norm, digits, toJid, sleep, formatUptime, ramUsage, jidNum, localParts, to12h, fill, TZ }
