const { bot, utils } = require('../lib')
const { jidNum, norm } = utils

// Morpion. Une partie par chat.
//   ttt @adversaire [infini]   défie quelqu'un (l'adversaire répond « oui » ou « non »)
//   ttt end                    arrête la partie
// Mode « infini » : 3 marques max par joueur, la plus ancienne disparaît à la 4e.
// Les coups se jouent en envoyant un chiffre de 1 à 9.
const games = new Map() // jid -> partie
const INVITE_MS = 60_000
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
const NUMS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

const board = (g) => {
  const c = g.cells.map((v, i) => v || NUMS[i])
  return `${c.slice(0, 3).join(' ')}\n${c.slice(3, 6).join(' ')}\n${c.slice(6).join(' ')}`
}
const winner = (cells) => LINES.some(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[a] === cells[c])
const mention = (j) => `@${jidNum(j)}`

const turnText = (g) =>
  `${board(g)}\n\nAu tour de ${mention(g.players[g.turn])} (${g.marks[g.turn]})\n_Envoyez un chiffre de 1 à 9._` +
  (g.infinite ? '\n_Mode infini : 3 marques max par joueur._' : '')

bot(
  { name: 'ttt', aliases: ['tictactoe', 'morpion'], desc: 'Morpion : ttt @membre [infini] · ttt end', type: 'jeux', onlyGroup: true },
  async (m, match) => {
    const g = games.get(m.jid)
    if (match.toLowerCase() === 'end') {
      if (!g) return m.reply('Aucune partie en cours.')
      const ok = m.isOwner || g.players.map(norm).includes(norm(m.sender)) || (await m.groupInfo()).isAdmin
      if (!ok) return m.reply('⛔ Seuls les joueurs ou les admins peuvent arrêter la partie.')
      games.delete(m.jid)
      return m.reply('_Partie de morpion arrêtée._')
    }
    if (g && (g.state === 'play' || Date.now() - g.created < INVITE_MS)) return m.reply('Une partie est déjà en cours dans ce chat. (ttt end pour l\'arrêter)')

    const opp = m.mentioned[0] || m.quoted?.sender
    if (!opp) return m.reply('Exemple : ttt @membre\nou : ttt @membre infini')
    if (norm(opp) === norm(m.sender)) return m.reply('Vous ne pouvez pas jouer contre vous-même.')
    if (opp === m.sock.user?.id || norm(opp) === norm(m.sock.user?.id || '')) return m.reply('Je ne joue pas, je regarde 👀')

    games.set(m.jid, {
      state: 'invite', created: Date.now(), infinite: /infini|infinite/i.test(match),
      players: [norm(m.sender), norm(opp)], marks: ['❌', '⭕'], cells: Array(9).fill(null), history: [[], []], turn: 0,
    })
    await m.send(`${mention(opp)}, ${mention(m.sender)} vous défie au morpion${/infini|infinite/i.test(match) ? ' (mode infini)' : ''} !\nRépondez *oui* pour accepter ou *non* pour refuser.`, { mentions: [opp, m.sender] })
  }
)

bot({ on: 'message' }, async (m) => {
  if (!m.isGroup || m.fromMe) return
  const g = games.get(m.jid)
  if (!g || !m.text) return
  const me = norm(m.sender)
  const t = m.text.trim().toLowerCase()

  if (g.state === 'invite') {
    if (Date.now() - g.created > INVITE_MS) return games.delete(m.jid)
    if (me !== g.players[1]) return
    if (['non', 'no'].includes(t)) {
      games.delete(m.jid)
      return m.send(`${mention(me)} a refusé le défi.`, { mentions: [me] })
    }
    if (['oui', 'yes', 'ok'].includes(t)) {
      g.state = 'play'
      return m.send(`Partie lancée !\n${mention(g.players[0])} ❌  vs  ${mention(g.players[1])} ⭕\n\n${turnText(g)}`, { mentions: g.players })
    }
    return
  }

  if (!/^[1-9]$/.test(t) || me !== g.players[g.turn]) return
  const i = Number(t) - 1
  if (g.cells[i]) return m.reply('Case déjà prise, choisissez-en une autre.')

  g.cells[i] = g.marks[g.turn]
  g.history[g.turn].push(i)
  if (g.infinite && g.history[g.turn].length > 3) g.cells[g.history[g.turn].shift()] = null

  if (winner(g.cells)) {
    games.delete(m.jid)
    return m.send(`${board(g)}\n\n🏆 ${mention(me)} a gagné !`, { mentions: [me] })
  }
  if (!g.infinite && g.cells.every(Boolean)) {
    games.delete(m.jid)
    return m.send(`${board(g)}\n\n🤝 Match nul.`)
  }
  g.turn = 1 - g.turn
  await m.send(turnText(g), { mentions: [g.players[g.turn]] })
})
