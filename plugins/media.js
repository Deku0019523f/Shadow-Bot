const fs = require('fs')
const PDFDocument = require('pdfkit')
const sharp = require('sharp')
const { bot, ffmpeg: ff } = require('../lib')

// Outils audio / vidéo / PDF (ffmpeg requis). On répond au média concerné.
const MAX = 60 * 1024 * 1024
const AV = ['audio', 'video']
const num = (s) => s !== '' && s != null && Number.isFinite(Number(s))

// Télécharge le média cité si son type est accepté, sinon répond avec l'usage
async function need(m, types, usage) {
  if (!types.includes(m.mediaType) || !m.quoted) {
    await m.reply(usage)
    return null
  }
  const buf = await m.downloadMedia().catch(() => null)
  if (!buf) {
    await m.reply('Impossible de télécharger le média.')
    return null
  }
  if (buf.length > MAX) {
    await m.reply('Fichier trop lourd (60 Mo max).')
    return null
  }
  return buf
}
const ext = (m) => ({ audio: 'mp3', video: 'mp4', image: 'jpg', sticker: 'webp' })[m.mediaType] || 'bin'

// Exécute ffmpeg avec plusieurs fichiers d'entrée : files = [Buffer, ...], build(paths) -> args
async function multi(files, build, outExt, inExts = []) {
  const ins = files.map((b, i) => ({ path: ff.tmp(inExts[i] || 'bin'), b }))
  const out = ff.tmp(outExt)
  await Promise.all(ins.map((f) => fs.promises.writeFile(f.path, f.b)))
  try {
    await ff.run([...build(ins.map((f) => f.path)), out])
    return await fs.promises.readFile(out)
  } finally {
    for (const f of [...ins.map((i) => i.path), out]) fs.promises.unlink(f).catch(() => {})
  }
}

const sendAudio = (m, buf) => m.sendMedia(buf, { type: 'audio' })
const sendVideo = (m, buf) => m.sendMedia(buf, { type: 'video' })
const guard = (fn) => async (m, match) => {
  try {
    await fn(m, match)
  } catch (e) {
    await m.reply(`❌ ${e.message}`)
  }
}

bot({ name: 'rotate', desc: 'Pivote une vidéo (rotate right|left|flip)', type: 'vidéo' }, guard(async (m, match) => {
  const mode = match.toLowerCase()
  if (!['right', 'left', 'flip'].includes(mode)) return m.reply('Exemple : rotate right|left|flip (en répondant à une vidéo).')
  const buf = await need(m, ['video'], 'Répondez à une vidéo. Exemple : rotate right|left|flip')
  if (!buf) return
  const vf = { right: 'transpose=1', left: 'transpose=2', flip: 'hflip' }[mode]
  await sendVideo(m, await ff.ffmpeg(buf, ['-vf', vf, '-c:a', 'copy'], 'mp4', { inExt: 'mp4' }))
}))

bot({ name: 'mp3', aliases: ['audio', 'toaudio'], desc: 'Vidéo → audio MP3, ou audio → note vocale', type: 'audio' }, guard(async (m) => {
  const buf = await need(m, AV, 'Répondez à une vidéo ou à un audio.')
  if (!buf) return
  if (m.mediaType === 'video') return sendAudio(m, await ff.toMp3(buf, 'mp4'))
  await m.sendMedia(await ff.toOpus(buf, 'ogg'), { type: 'audio', ptt: true })
}))

bot({ name: 'photo', desc: 'Sticker → image', type: 'sticker' }, guard(async (m) => {
  const buf = await need(m, ['sticker'], 'Répondez à un sticker.')
  if (!buf) return
  await m.sendMedia(await sharp(buf).png().toBuffer(), { type: 'image' })
}))

bot({ name: 'reverse', desc: 'Lit une vidéo ou un audio à l\'envers', type: 'audio' }, guard(async (m) => {
  const buf = await need(m, AV, 'Répondez à une vidéo ou à un audio.')
  if (!buf) return
  if (m.mediaType === 'audio') return sendAudio(m, await ff.ffmpeg(buf, ['-af', 'areverse'], 'mp3', { inExt: 'ogg' }))
  await sendVideo(m, await ff.ffmpeg(buf, ['-vf', 'reverse', '-af', 'areverse'], 'mp4', { inExt: 'mp4' }))
}))

bot({ name: 'cut', desc: 'Extrait un passage audio (cut début;durée en secondes)', type: 'audio' }, guard(async (m, match) => {
  const [s, d] = match.split(';').map((x) => x.trim())
  if (!num(s) || !num(d)) return m.reply('Exemple : cut 0;30 (début;durée) en répondant à un audio/vidéo.')
  const buf = await need(m, AV, 'Répondez à un audio ou une vidéo. Exemple : cut 0;30')
  if (!buf) return
  await sendAudio(m, await ff.ffmpeg(buf, ['-ss', s, '-t', d, '-vn', '-ar', '44100', '-b:a', '128k'], 'mp3', { inExt: ext(m) }))
}))

bot({ name: 'trim', desc: 'Coupe une vidéo (trim début;durée en secondes)', type: 'vidéo' }, guard(async (m, match) => {
  const [s, d] = match.split(';').map((x) => x.trim())
  if (!num(s) || !num(d)) return m.reply('Exemple : trim 10;30 (début;durée) en répondant à une vidéo.')
  const buf = await need(m, ['video'], 'Répondez à une vidéo. Exemple : trim 10;30')
  if (!buf) return
  await sendVideo(m, await ff.ffmpeg(buf, ['-ss', s, '-t', d, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'], 'mp4', { inExt: 'mp4' }))
}))

// --- Collections par chat : page/pdf, merge, avm ------------------------------------
const pages = new Map() // jid -> { n: Buffer }
const clips = new Map() // jid -> { n: Buffer }
const avm = new Map() // jid -> { audio, video }

bot({ name: 'page', desc: 'Ajoute une image comme page n d\'un PDF (page 1)', type: 'document' }, guard(async (m, match) => {
  if (!num(match)) return m.reply('Exemple : page 1 (en répondant à une image).')
  const buf = await need(m, ['image'], 'Répondez à une image. Exemple : page 1')
  if (!buf) return
  const set = pages.get(m.jid) || {}
  set[Number(match)] = buf
  pages.set(m.jid, set)
  await m.reply(`Page ${match} ajoutée !`)
}))

bot({ name: 'pdf', desc: 'Génère le PDF à partir des pages ajoutées (pdf titre)', type: 'document' }, guard(async (m, match) => {
  const set = pages.get(m.jid)
  if (!match) return m.reply('Exemple : pdf notes (donnez un titre ; ajoutez des pages avec « page 1 », « page 2 »…)')
  if (!set || !Object.keys(set).length) return m.reply('Aucune page. Répondez à une image avec : page 1')
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0 })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((r) => doc.on('end', r))
  for (const k of Object.keys(set).map(Number).sort((a, b) => a - b)) {
    const png = await sharp(set[k]).rotate().png().toBuffer()
    const { width, height } = await sharp(png).metadata()
    doc.addPage({ size: [width, height] })
    doc.image(png, 0, 0, { width, height })
  }
  doc.end()
  await done
  pages.delete(m.jid)
  await m.sendMedia(Buffer.concat(chunks), { type: 'document', mimetype: 'application/pdf', fileName: `${match.replace(/[^\w.-]+/g, '_')}.pdf` })
}))

bot({ name: 'merge', desc: 'Assemble des vidéos (merge 1, merge 2… puis merge)', type: 'vidéo' }, guard(async (m, match) => {
  if (m.quoted && m.mediaType === 'video') {
    if (!num(match)) return m.reply('Exemple : merge 1 (en répondant à une vidéo, numéro d\'ordre).')
    const buf = await need(m, ['video'], 'Répondez à une vidéo.')
    if (!buf) return
    const set = clips.get(m.jid) || {}
    set[Number(match)] = buf
    clips.set(m.jid, set)
    return m.reply(`_Vidéo ${match} ajoutée_`)
  }
  const set = clips.get(m.jid)
  const keys = Object.keys(set || {}).map(Number).sort((a, b) => a - b)
  if (keys.length < 2) return m.reply('Ajoutez au moins 2 vidéos : répondez à chacune avec « merge 1 », « merge 2 »… puis envoyez « merge ».')
  await m.reply(`_Assemblage de ${keys.length} vidéos_`)
  const out = await multi(keys.map((k) => set[k]), (p) => {
    const inputs = p.flatMap((f) => ['-i', f])
    const parts = p.map((_, i) => `[${i}:v]scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:-1:-1,setsar=1,fps=25[v${i}];[${i}:a]aresample=44100[a${i}]`).join(';')
    const cat = p.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${p.length}:v=1:a=1[v][a]`
    return [...inputs, '-filter_complex', `${parts};${cat}`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac']
  }, 'mp4', keys.map(() => 'mp4'))
  clips.delete(m.jid)
  await sendVideo(m, out)
}))

bot({ name: 'compress', desc: 'Compresse une vidéo', type: 'vidéo' }, guard(async (m) => {
  const buf = await need(m, ['video'], 'Répondez à une vidéo.')
  if (!buf) return
  const out = await ff.ffmpeg(buf, ['-vf', "scale='min(640,iw)':-2", '-c:v', 'libx264', '-crf', '32', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart'], 'mp4', { inExt: 'mp4' })
  await sendVideo(m, out)
}))

for (const [name, filter, label] of [['bass', 'bass', 'graves'], ['treble', 'treble', 'aigus']]) {
  bot({ name, desc: `Modifie les ${label} d'un audio (${name} 10)`, type: 'audio' }, guard(async (m, match) => {
    const g = num(match) ? Math.max(-30, Math.min(30, Number(match))) : 10
    const buf = await need(m, AV, `Répondez à un audio ou une vidéo. Exemple : ${name} 10`)
    if (!buf) return
    await sendAudio(m, await ff.ffmpeg(buf, ['-vn', '-af', `${filter}=g=${g}`], 'mp3', { inExt: ext(m) }))
  }))
}

bot({ name: 'low', desc: 'Voix plus grave', type: 'audio' }, guard(async (m) => {
  const buf = await need(m, AV, 'Répondez à un audio ou une vidéo.')
  if (!buf) return
  await sendAudio(m, await ff.ffmpeg(buf, ['-vn', '-af', 'asetrate=44100*0.8,aresample=44100,atempo=1.25'], 'mp3', { inExt: ext(m) }))
}))

bot({ name: 'pitch', desc: 'Voix plus aiguë', type: 'audio' }, guard(async (m) => {
  const buf = await need(m, AV, 'Répondez à un audio ou une vidéo.')
  if (!buf) return
  await sendAudio(m, await ff.ffmpeg(buf, ['-vn', '-af', 'asetrate=44100*1.25,aresample=44100,atempo=0.8'], 'mp3', { inExt: ext(m) }))
}))

// Audio -> vidéo avec visualisation
const visual = (name, desc, graph) =>
  bot({ name, desc, type: 'audio' }, guard(async (m) => {
    const buf = await need(m, AV, 'Répondez à un audio ou une vidéo.')
    if (!buf) return
    const out = await multi([buf], ([i]) => ['-i', i, '-filter_complex', graph, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'mp4', [ext(m)])
    await sendVideo(m, out)
  }))
visual('histo', 'Audio → vidéo avec histogramme', '[0:a]showfreqs=s=640x360:mode=bar:fscale=log,format=yuv420p[v]')
visual('vector', 'Audio → vidéo avec vectorscope', '[0:a]avectorscope=s=640x360:zoom=1.5,format=yuv420p[v]')
visual('avec', 'Audio → vidéo (forme d\'onde)', '[0:a]showwaves=s=640x360:mode=cline:colors=white,format=yuv420p[v]')

bot({ name: 'black', desc: 'Audio → vidéo à fond noir', type: 'audio' }, guard(async (m) => {
  const buf = await need(m, AV, 'Répondez à un audio ou une vidéo.')
  if (!buf) return
  const out = await multi([buf], ([i]) => ['-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=15', '-i', i, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'mp4', [ext(m)])
  await sendVideo(m, out)
}))

bot({ name: 'avm', desc: 'Fusionne un audio et une vidéo (répondre à chacun, puis avm)', type: 'divers' }, guard(async (m) => {
  const set = avm.get(m.jid) || {}
  if (m.quoted && AV.includes(m.mediaType)) {
    const buf = await need(m, AV, 'Répondez à un audio ou une vidéo.')
    if (!buf) return
    set[m.mediaType] = buf
    avm.set(m.jid, set)
    return m.reply(m.mediaType === 'audio' ? '_Audio ajouté !_' : '_Vidéo ajoutée !_')
  }
  if (!set.audio || !set.video) return m.reply('Répondez à un audio avec « avm », puis à une vidéo avec « avm », puis envoyez « avm ».')
  const out = await multi([set.video, set.audio], ([v, a]) => ['-i', v, '-i', a, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 'mp4', ['mp4', 'mp3'])
  avm.delete(m.jid)
  await sendVideo(m, out)
}))

bot({ name: 'crop', desc: 'Recadre une vidéo (crop largeur,hauteur,x,y)', type: 'vidéo' }, guard(async (m, match) => {
  const p = match.split(',').map((x) => x.trim())
  if (p.length !== 4 || !p.every(num)) return m.reply('Exemple : crop 512,512,0,0 (largeur,hauteur,x,y) en répondant à une vidéo.')
  const buf = await need(m, ['video'], 'Répondez à une vidéo.')
  if (!buf) return
  await sendVideo(m, await ff.ffmpeg(buf, ['-vf', `crop=${p.join(':')}`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy'], 'mp4', { inExt: 'mp4' }))
}))
