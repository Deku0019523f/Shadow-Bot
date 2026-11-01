const { bot } = require('../lib')

// Polices stylisées : fancy <texte> liste les styles ; fancy 5 (en répondant à un texte) applique le style n°5
const A = 'abcdefghijklmnopqrstuvwxyz'
const U = A.toUpperCase()
const D = '0123456789'

// Table par plages Unicode : (majuscules, minuscules, chiffres) en tableaux de points de code
const range = (start, len) => Array.from({ length: len }, (_, i) => String.fromCodePoint(start + i))
const mk = (up, low, dig) => (s) =>
  [...s].map((c) => {
    const iu = U.indexOf(c), il = A.indexOf(c), id = D.indexOf(c)
    if (iu >= 0 && up) return up[iu]
    if (il >= 0 && low) return low[il]
    if (id >= 0 && dig) return dig[id]
    return c
  }).join('')
const same = (r, d) => mk(r, r, d)

// Certains points de code Unicode sont « réservés » : on les remplace par les lettres équivalentes
const patch = (fn, map) => (s) => [...s].map((c) => map[c] || fn(c)).join('')
const SCRIPT_FIX = { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' }
const GOTHIC_FIX = { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' }
const DOUBLE_FIX = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }

const SMALL_CAPS = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ'.split('')
const CIRCLED = [...range(0x24b6, 26)]
const CIRCLED_L = [...range(0x24d0, 26)]
const SQUARED = range(0x1f130, 26)
const NEG_SQ = range(0x1f170, 26)
const SUPER = 'ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖqʳˢᵗᵘᵛʷˣʸᶻ'.split('')
const FULL_U = range(0xff21, 26), FULL_L = range(0xff41, 26), FULL_D = range(0xff10, 10)
const FLIP = { a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ', n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z' }

const STYLES = [
  ['Gras', mk(range(0x1d400, 26), range(0x1d41a, 26), range(0x1d7ce, 10))],
  ['Italique', mk(range(0x1d434, 26), [...range(0x1d44e, 7).slice(0, 7), 'ℎ', ...range(0x1d456, 19)].slice(0, 26), null)],
  ['Gras italique', mk(range(0x1d468, 26), range(0x1d482, 26), null)],
  ['Script', patch(mk(range(0x1d49c, 26), range(0x1d4b6, 26), null), SCRIPT_FIX)],
  ['Script gras', mk(range(0x1d4d0, 26), range(0x1d4ea, 26), null)],
  ['Gothique', patch(mk(range(0x1d504, 26), range(0x1d51e, 26), null), GOTHIC_FIX)],
  ['Gothique gras', mk(range(0x1d56c, 26), range(0x1d586, 26), null)],
  ['Double barre', patch(mk(range(0x1d538, 26), range(0x1d552, 26), range(0x1d7d8, 10)), DOUBLE_FIX)],
  ['Sans-serif', mk(range(0x1d5a0, 26), range(0x1d5ba, 26), range(0x1d7e2, 10))],
  ['Sans-serif gras', mk(range(0x1d5d4, 26), range(0x1d5ee, 26), range(0x1d7ec, 10))],
  ['Sans-serif italique', mk(range(0x1d608, 26), range(0x1d622, 26), null)],
  ['Machine à écrire', mk(range(0x1d670, 26), range(0x1d68a, 26), range(0x1d7f6, 10))],
  ['Petites capitales', (s) => [...s.toLowerCase()].map((c) => (A.includes(c) ? SMALL_CAPS[A.indexOf(c)] : c)).join('')],
  ['Cerclé', mk(CIRCLED, CIRCLED_L, null)],
  ['Carré', same(SQUARED, null)],
  ['Carré noir', same(NEG_SQ, null)],
  ['Exposant', (s) => [...s.toLowerCase()].map((c) => (A.includes(c) ? SUPER[A.indexOf(c)] : c)).join('')],
  ['Pleine largeur', mk(FULL_U, FULL_L, FULL_D)],
  ['Renversé', (s) => [...s.toLowerCase()].map((c) => FLIP[c] || c).reverse().join('')],
  ['Espacé', (s) => [...s].join(' ')],
  ['Barré', (s) => [...s].map((c) => c + '̶').join('')],
  ['Souligné', (s) => [...s].map((c) => c + '̲').join('')],
  ['Points', (s) => [...s].map((c) => (c === ' ' ? c : c + '̇')).join('')],
]

const preview = 'Shadow'
bot({ name: 'fancy', desc: 'Polices stylisées (fancy texte = liste ; fancy 5 en répondant à un texte)', type: 'outils' }, async (m, match) => {
  const n = parseInt(match)
  if (m.quoted?.text && !Number.isNaN(n)) {
    const style = STYLES[n - 1]
    if (!style) return m.reply(`Choisissez un numéro entre 1 et ${STYLES.length}.`)
    return m.reply(style[1](m.quoted.text))
  }
  if (match && Number.isNaN(n)) return m.reply(STYLES.map(([name, f], i) => `${i + 1}. ${name}\n${f(match)}`).join('\n\n'))
  await m.reply('Exemple : fancy Shadow (liste tous les styles)\nPuis répondez à un texte avec : fancy 5\n\n' + STYLES.map(([name, f], i) => `${i + 1}. ${f(preview)}  _${name}_`).join('\n'))
})
