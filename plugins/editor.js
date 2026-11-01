const { bot, config } = require('../lib')

// Effets photo par IA (Gemini, GEMINI_API_KEY). Modèle surchargeable : GEMINI_IMAGE_MODEL.
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'

const EFFECTS = {
  skull: 'Transform the person into a realistic skull / skeleton portrait while keeping the pose and background.',
  sketch: 'Convert this photo into a detailed black and white pencil sketch drawing.',
  pencil: 'Convert this photo into a hand-drawn colored pencil illustration.',
  color: 'Colorize this photo with natural, realistic colors (or enhance its colors if already colored).',
  kiss: 'Edit the image so that the people appear romantically kissing, keeping it tasteful and realistic.',
  bokeh: 'Apply a strong cinematic bokeh effect: sharp subject, beautifully blurred background with light orbs.',
  wanted: 'Place this photo on a vintage "WANTED" poster with worn paper texture and a reward text.',
  look: 'Give this photo a dramatic cinematic look with moody lighting and rich contrast.',
  gandm: 'Turn this photo into a gangster-style stylized portrait with a gritty dramatic look.',
  dark: 'Give this photo a dark, gothic, moody atmosphere with deep shadows.',
  makeup: 'Add tasteful, professional makeup to the face in this photo.',
  cartoon: 'Turn this photo into a vibrant cartoon / animated movie style illustration.',
  demon: 'Transform the person into a demon with horns and glowing eyes, keeping the pose.',
  bloody: 'Give the photo a horror-movie look with stylized fake blood splatter (non-graphic).',
  zombie: 'Transform the person into a zombie with a horror-movie makeup look.',
  horned: 'Add realistic devil horns to the person in this photo.',
  enhance: 'Enhance this photo: improve sharpness, lighting, color and remove noise, keeping it natural.',
}

async function edit(buf, prompt) {
  const key = config.KEYS.GEMINI
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } }] }] }),
    signal: AbortSignal.timeout(90_000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error?.message || `HTTP ${res.status}`)
  const parts = json.candidates?.[0]?.content?.parts || []
  const img = parts.find((p) => p.inlineData || p.inline_data)
  const data = (img?.inlineData || img?.inline_data)?.data
  if (!data) throw new Error(parts.find((p) => p.text)?.text?.slice(0, 200) || 'Aucune image renvoyée (contenu refusé ?)')
  return Buffer.from(data, 'base64')
}

for (const [name, prompt] of Object.entries(EFFECTS)) {
  bot({ name, desc: `Effet photo « ${name} » par IA (répondre à une image)`, type: 'images' }, async (m) => {
    if (!config.KEYS.GEMINI) return m.reply('⚠️ Clé GEMINI_API_KEY manquante.')
    if (m.mediaType !== 'image' || !m.quoted) return m.reply('Répondez à une image.')
    await m.react('⏳')
    try {
      const out = await edit(await m.downloadMedia(), prompt)
      await m.sendMedia(out, { type: 'image' })
      await m.react('✅')
    } catch (e) {
      await m.reply(`❌ ${e.message}`)
    }
  })
}
