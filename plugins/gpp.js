const { bot } = require('../lib')

bot(
  { name: 'gpp', desc: "Change l'icône du groupe (en réponse à une image)", type: 'groupe', onlyGroup: true, admin: true },
  async (m, match, ctx) => {
    // Si le groupe est « restreint » (seuls les admins modifient les infos), le bot doit être admin
    if (ctx.group.meta.restrict && !ctx.group.isBotAdmin) return m.reply('⚠️ Je dois être admin du groupe pour faire ça.')
    if (m.quoted?.type !== 'imageMessage') return m.reply('Répondez à une image.')
    const buf = await m.downloadMedia()
    await m.sock.updateProfilePicture(m.jid, buf)
    await m.reply("_Icône du groupe mise à jour_")
  }
)
