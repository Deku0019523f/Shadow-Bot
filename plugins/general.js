const { bot, config, utils } = require('../lib')

bot({ name: 'ping', desc: 'Mesure la latence du bot', type: 'général' }, async (m) => {
  const t = Date.now()
  const sent = await m.reply('🏓 Ping...')
  await m.sock.sendMessage(m.jid, { text: `🏓 Pong ! ${Date.now() - t} ms`, edit: sent.key })
})

bot({ name: 'alive', desc: 'Vérifie que le bot fonctionne', type: 'général' }, async (m) => {
  await m.reply(
    [
      `✅ *${config.BOT_NAME}* est en ligne`,
      `• Version : ${config.VERSION}`,
      `• Uptime : ${utils.formatUptime(process.uptime())}`,
      `• Mémoire : ${utils.ramUsage()}`,
    ].join('\n')
  )
})

bot({ name: 'menu', aliases: ['help', 'aide'], desc: 'Affiche la liste des commandes', type: 'général' }, async (m, match, ctx) => {
  const disabled = ctx.db.get('global', 'disabled', [])
  const byType = {}
  for (const c of ctx.commands) {
    if (c.hidden) continue
    ;(byType[c.type] ||= []).push(c)
  }

  const header = [
    `╭──── ${config.BOT_NAME} ────`,
    `│ Salut ${m.pushName || ''} 👋`,
    `│ Préfixe : ${ctx.PREFIX}`,
    `│ Commandes : ${ctx.commands.filter((c) => !c.hidden).length}`,
    `╰────────────────`,
  ].join('\n')

  const wanted = match.toLowerCase()
  const types = Object.keys(byType).sort()
  const shown = wanted && byType[wanted] ? [wanted] : types

  const blocks = shown.map((t) => {
    const lines = byType[t]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `│ ${ctx.PREFIX}${c.name}${disabled.includes(c.name) ? ' [désactivée]' : ''}${c.desc ? ` — ${c.desc}` : ''}`)
    return `╭─❏ ${t.toUpperCase()} ❏\n${lines.join('\n')}\n╰─────────────`
  })

  await m.reply(`${header}\n\n${blocks.join('\n\n')}`)
})

bot({ name: 'list', desc: 'Liste compacte de toutes les commandes', type: 'général' }, async (m, match, ctx) => {
  const names = ctx.commands.filter((c) => !c.hidden).map((c) => c.name).sort()
  await m.reply(`*${names.length} commandes*\n\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}`)
})
