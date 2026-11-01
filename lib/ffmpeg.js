// Conversions audio/vidéo/image via le binaire ffmpeg (doit être installé : voir Dockerfile)

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

const tmp = (ext = '') => path.join(os.tmpdir(), `deku-${crypto.randomBytes(6).toString('hex')}${ext ? '.' + ext : ''}`)

function run(args, { timeout = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
    let err = ''
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout)
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => {
      clearTimeout(timer)
      reject(e.code === 'ENOENT' ? new Error('ffmpeg n\'est pas installé sur ce serveur') : e)
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      code === 0 ? resolve() : reject(new Error(`ffmpeg a échoué : ${err.trim().split('\n').pop()}`))
    })
  })
}

// Convertit un Buffer : ffmpeg(buffer, ['-vn', '-ac', '2'], 'mp3') -> Buffer
// `inExt` aide ffmpeg à reconnaître le format d'entrée (ex: 'mp4', 'ogg', 'webp').
async function ffmpeg(input, args, outExt, { inExt = 'bin', timeout } = {}) {
  const inFile = tmp(inExt)
  const outFile = tmp(outExt)
  await fs.promises.writeFile(inFile, input)
  try {
    await run(['-i', inFile, ...args, outFile], { timeout })
    return await fs.promises.readFile(outFile)
  } finally {
    fs.promises.unlink(inFile).catch(() => {})
    fs.promises.unlink(outFile).catch(() => {})
  }
}

// Raccourcis courants
const toMp3 = (buf, inExt) => ffmpeg(buf, ['-vn', '-ar', '44100', '-ac', '2', '-b:a', '128k'], 'mp3', { inExt })
// Note vocale WhatsApp (PTT) : OGG/Opus
const toOpus = (buf, inExt) => ffmpeg(buf, ['-vn', '-c:a', 'libopus', '-b:a', '64k', '-ac', '1', '-ar', '48000'], 'ogg', { inExt })
// Vidéo compatible WhatsApp (H.264 + AAC)
const toMp4 = (buf, inExt) =>
  ffmpeg(buf, ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'], 'mp4', { inExt })

module.exports = { ffmpeg, run, tmp, toMp3, toOpus, toMp4 }
