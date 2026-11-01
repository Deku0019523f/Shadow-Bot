// Téléchargements via le binaire yt-dlp (YouTube, TikTok, Instagram, Facebook, Twitter/X, Reddit...)
// yt-dlp et ffmpeg doivent être installés sur le serveur (voir Dockerfile).
//
//   const { buffer, title, ext } = await download(url, { audio: true })
//   const info = await getInfo(url)

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { tmp } = require('./ffmpeg')

const BIN = process.env.YTDLP_BIN || 'yt-dlp'
const MAX_MB = Number(process.env.MAX_DOWNLOAD_MB) || 90 // WhatsApp refuse les gros fichiers

function exec(args, { timeout = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, args)
    let out = ''
    let err = ''
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => {
      clearTimeout(timer)
      reject(e.code === 'ENOENT' ? new Error("yt-dlp n'est pas installé sur ce serveur") : e)
    })
    p.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(out)
      const line = err.trim().split('\n').filter(Boolean).pop() || 'erreur inconnue'
      reject(new Error(`yt-dlp : ${line.replace(/^ERROR:\s*/, '')}`))
    })
  })
}

// Fichier de cookies optionnel (YouTube connecté, contenus restreints) : commande `ytlogin`
const cookiesArgs = () => {
  const f = process.env.YTDLP_COOKIES || path.join(process.cwd(), 'data', 'cookies.txt')
  return fs.existsSync(f) ? ['--cookies', f] : []
}

async function getInfo(url) {
  const out = await exec(['--no-playlist', '--no-warnings', '-J', ...cookiesArgs(), url], { timeout: 60_000 })
  return JSON.parse(out)
}

// audio: true -> MP3 ; sinon vidéo MP4 (≤ `height` px)
async function download(url, { audio = false, height = 720 } = {}) {
  const base = tmp()
  const args = [
    '--no-playlist', '--no-warnings', '--no-progress',
    '--max-filesize', `${MAX_MB}M`,
    '-o', `${base}.%(ext)s`,
    '--print', 'after_move:filepath',
    '--print', 'title',
    ...cookiesArgs(),
  ]
  if (audio) args.push('-x', '--audio-format', 'mp3', '--audio-quality', '5')
  else args.push('-f', `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]/b[height<=${height}][ext=mp4]/b[height<=${height}]/b`, '--merge-output-format', 'mp4')
  args.push(url)

  const out = (await exec(args)).trim().split('\n')
  const file = out[out.length - 1]
  const title = out.length > 1 ? out[0] : 'media'
  if (!file || !fs.existsSync(file)) throw new Error('Téléchargement impossible (fichier trop lourd ou indisponible).')
  try {
    return { buffer: await fs.promises.readFile(file), title, ext: path.extname(file).slice(1) }
  } finally {
    fs.promises.unlink(file).catch(() => {})
  }
}

module.exports = { exec, getInfo, download }
