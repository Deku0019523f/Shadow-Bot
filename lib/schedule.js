// Planification : "min-heure[-jour[-mois]]" (fuseau TZ) -> prochain horodatage UTC (ms)
const { TZ } = require('./utils')

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const offsetAt = (date) => {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}
const zonedToUtc = (y, mo, d, h, mi) => {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  return guess - offsetAt(new Date(guess))
}
const nowParts = () => {
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, Number(x.value)]))
  return { y: p.year, mo: p.month, d: p.day }
}

// "30-14" (14:30 aujourd'hui/demain) · "30-14-25" (le 25) · "30-14-25-12" (25 décembre)
function parse(spec) {
  const parts = String(spec).trim().split('-').map((x) => x.trim())
  if (parts.length < 2 || parts.length > 4 || !parts.every((x) => /^\d{1,2}$/.test(x))) return null
  const [min, hour, day, month] = parts.map(Number)
  if (min > 59 || hour > 23 || (day !== undefined && (day < 1 || day > 31)) || (month !== undefined && (month < 1 || month > 12))) return null
  const { y, mo, d } = nowParts()
  const now = Date.now()
  let at
  if (month !== undefined) {
    at = zonedToUtc(y, month, day, hour, min)
    if (at <= now) at = zonedToUtc(y + 1, month, day, hour, min)
  } else if (day !== undefined) {
    at = zonedToUtc(y, mo, day, hour, min)
    if (at <= now) at = zonedToUtc(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, day, hour, min)
  } else {
    at = zonedToUtc(y, mo, d, hour, min)
    if (at <= now) at += 86_400_000
  }
  return at
}

// Langage naturel (FR/EN) : « demain à 10h », « dans 2 heures », « tous les jours à 8:30 », « 25/12 à 9h »…
// -> { at, repeat, rest } (rest = le texte restant, sans la partie date) ou null
function natural(input) {
  let rest = String(input)
  const take = (re) => {
    const m = rest.match(re)
    if (m) rest = rest.replace(m[0], ' ')
    return m
  }
  const repeat = !!take(/\b(tous les jours|chaque jour|every ?day|quotidien(?:nement)?)\b/i)

  const rel = take(/\b(?:dans|in)\s+(\d+)\s*(secondes?|sec|s|minutes?|mins?|m|heures?|h|hours?|jours?|j|days?|d)\b/i)
  if (rel) {
    const n = Number(rel[1])
    const u = rel[2].toLowerCase()
    const ms = /^s/.test(u) ? 1000 : /^(m)/.test(u) ? 60_000 : /^(h)/.test(u) ? 3_600_000 : 86_400_000
    return { at: Date.now() + n * ms, repeat, rest: clean(rest) }
  }

  let offset = null
  if (take(/\b(apr[eè]s[- ]demain|day after tomorrow)\b/i)) offset = 2
  else if (take(/\b(demain|tomorrow)\b/i)) offset = 1
  else if (take(/\b(aujourd['’]?hui|today|ce soir|tonight)\b/i)) offset = 0
  let ymd = null
  const dm = take(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (dm) ymd = { d: Number(dm[1]), mo: Number(dm[2]), y: dm[3] ? Number(dm[3]) + (dm[3].length === 2 ? 2000 : 0) : null }

  let hour = null
  let min = 0
  let t = take(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(am|pm)?\b/i)
  if (t) { hour = Number(t[1]); min = Number(t[2] || 0); if (t[3]) hour = (hour % 12) + (t[3].toLowerCase() === 'pm' ? 12 : 0) }
  else if ((t = take(/\b(\d{1,2})\s*(am|pm)\b/i))) hour = (Number(t[1]) % 12) + (t[2].toLowerCase() === 'pm' ? 12 : 0)
  if (hour === null && offset === null && !ymd && !repeat) return null
  if (hour !== null && (hour > 23 || min > 59)) return null
  if (hour === null) { hour = 9; min = 0 }

  const now = nowParts()
  let at
  if (ymd) {
    at = zonedToUtc(ymd.y || now.y, ymd.mo, ymd.d, hour, min)
    if (!ymd.y && at <= Date.now()) at = zonedToUtc(now.y + 1, ymd.mo, ymd.d, hour, min)
  } else {
    const base = new Date(Date.UTC(now.y, now.mo - 1, now.d + (offset || 0)))
    at = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, min)
    if (at <= Date.now() && offset === null) at += 86_400_000
  }
  return { at, repeat, rest: clean(rest) }
}
const clean = (s) => s.replace(/\s+/g, ' ').replace(/^\s*(?:à|a|at|le|on|vers)(?=\s|$)/i, '').replace(/^[\s,;:|-]+|[\s,;:|-]+$/g, '')

const show = (ts) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(ts))

module.exports = { parse, natural, show, zonedToUtc }
