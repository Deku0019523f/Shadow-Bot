const { bot, http, utils } = require('../lib')
const { jidNum, norm } = utils

// Jeux de mots (un par chat)
//   wcg [facile|difficile]   chaîne de mots : chaque mot commence par la dernière lettre du précédent
//   wrg [facile|difficile]   mot aléatoire : chaque tour impose une lettre de départ et une longueur minimale
//   wcg end | wrg end        arrête la partie
// Les joueurs rejoignent en envoyant « join » pendant 60 s (2 joueurs min). Dernier en jeu = gagnant.
// Validation par dictionaryapi.dev (WCG_LANG, défaut fr) ; si l'API est injoignable, le mot est accepté.
const LANG = process.env.WCG_LANG || 'fr'
const JOIN_MS = 60_000
const LETTERS = 'abcdefghilmnoprstuv'
const games = new Map()
const mention = (j) => `@${jidNum(j)}`
const clean = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

async function isWord(word) {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/v2/entries/${LANG}/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': http.UA } })
    if (r.status === 404) return false
    return true
  } catch {
    return true
  }
}

const current = (g) => g.alive[g.idx % g.alive.length]
const limitFor = (g) => Math.max(10, (g.hard ? 25 : 40) - g.round * (g.hard ? 1 : 0.5)) // secondes
const minLen = (g) => (g.hard ? Math.min(3 + Math.floor(g.round / 4), 8) : Math.min(3 + Math.floor(g.round / 8), 5))

function prompt(g) {
  const who = current(g)
  const n = minLen(g)
  const sec = Math.round(limitFor(g))
  return g.kind === 'wcg'
    ? `Tour de ${mention(who)}\nUn mot de *${n}+ lettres* commençant par *${g.letter.toUpperCase()}*\n⏱️ ${sec} s`
    : `Tour de ${mention(who)}\nUn mot de *${n}+ lettres* commençant par *${g.letter.toUpperCase()}*\n⏱️ ${sec} s`
}

async function turn(g) {
  clearTimeout(g.timer)
  if (g.kind === 'wrg') g.letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]
  await g.m.send(prompt(g), { mentions: [current(g)] })
  const who = current(g)
  g.timer = setTimeout(async () => {
    if (!games.has(g.jid) || current(g) !== who) return
    await eliminate(g, `⏰ Temps écoulé pour ${mention(who)} !`)
  }, limitFor(g) * 1000)
}

async function eliminate(g, text) {
  g.alive = g.alive.filter((j) => j !== current(g))
  if (g.alive.length <= 1) {
    games.delete(g.jid)
    clearTimeout(g.timer)
    return g.m.send(`${text}\n\n🏆 ${mention(g.alive[0])} remporte la partie !`, { mentions: g.alive })
  }
  g.idx = g.idx % g.alive.length
  await g.m.send(`${text}\nJoueurs restants : ${g.alive.length}`, { mentions: [] })
  g.round += 1
  await turn(g)
}

for (const kind of ['wcg', 'wrg']) {
  bot(
    {
      name: kind,
      desc: kind === 'wcg' ? 'Chaîne de mots (wcg [facile|difficile] · wcg end)' : 'Mot à lettre aléatoire (wrg [facile|difficile] · wrg end)',
      type: 'jeux',
      onlyGroup: true,
    },
    async (m, match) => {
      const g = games.get(m.jid)
      if (match.toLowerCase() === 'end') {
        if (!g) return m.reply('Aucune partie en cours.')
        if (!m.isOwner && !(await m.groupInfo()).isAdmin && !g.players.includes(norm(m.sender))) return m.reply('⛔ Réservé aux joueurs ou aux admins.')
        clearTimeout(g.timer)
        clearTimeout(g.joinTimer)
        games.delete(m.jid)
        return m.reply('_Partie arrêtée._')
      }
      if (g) return m.reply('Une partie est déjà en cours dans ce chat. (' + g.kind + ' end pour l\'arrêter)')

      const hard = /diff|hard/i.test(match)
      const game = { jid: m.jid, kind, hard, state: 'join', players: [norm(m.sender)], alive: [], idx: 0, round: 0, used: new Set(), letter: '', m }
      games.set(m.jid, game)
      await m.send(
        `🎮 *${kind === 'wcg' ? 'Chaîne de mots' : 'Mot aléatoire'}* (${hard ? 'difficile' : 'facile'})\n${mention(m.sender)} lance une partie.\nEnvoyez *join* dans les 60 s pour participer (2 joueurs min).`,
        { mentions: [m.sender] }
      )
      game.joinTimer = setTimeout(async () => {
        if (games.get(m.jid) !== game || game.state !== 'join') return
        if (game.players.length < 2) {
          games.delete(m.jid)
          return m.send('Pas assez de joueurs, partie annulée.')
        }
        game.state = 'play'
        game.alive = [...game.players].sort(() => Math.random() - 0.5)
        game.letter = LETTERS[Math.floor(Math.random() * LETTERS.length)]
        await m.send(`Partie lancée avec ${game.players.length} joueurs : ${game.players.map(mention).join(', ')}`, { mentions: game.players })
        await turn(game)
      }, JOIN_MS)
    }
  )
}

bot({ on: 'message' }, async (m) => {
  if (!m.isGroup || m.fromMe || !m.text) return
  const g = games.get(m.jid)
  if (!g) return
  const me = norm(m.sender)

  if (g.state === 'join') {
    if (m.text.trim().toLowerCase() === 'join' && !g.players.includes(me)) {
      g.players.push(me)
      await m.send(`${mention(me)} a rejoint la partie (${g.players.length} joueurs).`, { mentions: [me] })
    }
    return
  }
  if (me !== current(g) || /\s/.test(m.text.trim()) || !/^\p{L}+$/u.test(m.text.trim())) return

  g.m = m
  const raw = m.text.trim().toLowerCase()
  const word = clean(raw)
  const n = minLen(g)
  if (!word.startsWith(g.letter)) return m.reply(`Le mot doit commencer par *${g.letter.toUpperCase()}*.`)
  if (word.length < n) return m.reply(`Au moins *${n}* lettres.`)
  if (g.used.has(word)) return m.reply('Mot déjà utilisé.')
  if (!(await isWord(raw))) return m.reply(`« ${raw} » n'est pas dans le dictionnaire.`)
  if (games.get(m.jid) !== g || me !== current(g)) return

  g.used.add(word)
  clearTimeout(g.timer)
  await m.react('✅')
  g.idx = (g.idx + 1) % g.alive.length
  g.round += 1
  if (g.kind === 'wcg') g.letter = word[word.length - 1]
  await turn(g)
})
