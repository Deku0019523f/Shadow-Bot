// Session WhatsApp stockée en base (SQLite ou PostgreSQL) au lieu de fichiers :
// elle survit aux redéploiements sur les hébergeurs à disque éphémère.

const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys')
const storage = require('./storage')

const enc = (v) => JSON.stringify(v, BufferJSON.replacer)
const dec = (s) => JSON.parse(s, BufferJSON.reviver)

async function useDbAuthState(sid) {
  const driver0 = storage.get()
  const P = `${sid}|` // chaque session a ses propres clés
  const driver = {
    getAuth: (k) => driver0.getAuth(P + k),
    setAuth: (k, v) => driver0.setAuth(P + k, v),
    delAuth: (k) => driver0.delAuth(P + k),
  }

  const raw = await driver.getAuth('creds')
  const creds = raw ? dec(raw) : initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}
          await Promise.all(
            ids.map(async (id) => {
              const s = await driver.getAuth(`${type}-${id}`)
              let value = s ? dec(s) : null
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value)
              }
              data[id] = value
            })
          )
          return data
        },
        set: async (data) => {
          const tasks = []
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              const key = `${category}-${id}`
              tasks.push(value ? driver.setAuth(key, enc(value)) : driver.delAuth(key))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: () => driver.setAuth('creds', enc(creds)),
    clear: () => driver0.clearAuthPrefix(P),
  }
}

module.exports = { useDbAuthState }
