// Couche de persistance : SQLite (par défaut, local/VPS/Docker) ou PostgreSQL
// (si DATABASE_URL est défini — indispensable sur Render/Railway/Koyeb... dont le disque est éphémère).
//
// Deux tables :
//   kv(scope, key, value)  -> réglages du bot (JSON)
//   auth(key, value)       -> session WhatsApp (clés Signal, identifiants)

const fs = require('fs')
const path = require('path')
const config = require('../config')

let driver = null

function sqliteDriver() {
  const Database = require('better-sqlite3')
  fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true })
  const db = new Database(config.DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (scope, key));
    CREATE TABLE IF NOT EXISTS auth (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  const q = {
    allKv: db.prepare('SELECT scope, key, value FROM kv'),
    setKv: db.prepare('INSERT INTO kv (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value'),
    delKv: db.prepare('DELETE FROM kv WHERE scope = ? AND key = ?'),
    getAuth: db.prepare('SELECT value FROM auth WHERE key = ?'),
    setAuth: db.prepare('INSERT INTO auth (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    delAuth: db.prepare('DELETE FROM auth WHERE key = ?'),
    clearAuthPrefix: db.prepare('DELETE FROM auth WHERE substr(key, 1, length(?)) = ?'),
  }
  return {
    name: 'sqlite',
    async allKv() { return q.allKv.all() },
    async setKv(s, k, v) { q.setKv.run(s, k, v) },
    async delKv(s, k) { q.delKv.run(s, k) },
    async getAuth(k) { return q.getAuth.get(k)?.value ?? null },
    async setAuth(k, v) { q.setAuth.run(k, v) },
    async delAuth(k) { q.delAuth.run(k) },
    async clearAuthPrefix(p) { q.clearAuthPrefix.run(p, p) },
    async close() { db.close() },
  }
}

async function pgDriver() {
  const { Pool } = require('pg')
  const url = config.DATABASE_URL
  const local = /localhost|127\.0\.0\.1/.test(url)
  const pool = new Pool({
    connectionString: url,
    ssl: local || config.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: 5,
  })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (scope, key));
    CREATE TABLE IF NOT EXISTS auth (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  return {
    name: 'postgres',
    async allKv() { return (await pool.query('SELECT scope, key, value FROM kv')).rows },
    async setKv(s, k, v) {
      await pool.query('INSERT INTO kv (scope, key, value) VALUES ($1, $2, $3) ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value', [s, k, v])
    },
    async delKv(s, k) { await pool.query('DELETE FROM kv WHERE scope = $1 AND key = $2', [s, k]) },
    async getAuth(k) { return (await pool.query('SELECT value FROM auth WHERE key = $1', [k])).rows[0]?.value ?? null },
    async setAuth(k, v) {
      await pool.query('INSERT INTO auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [k, v])
    },
    async delAuth(k) { await pool.query('DELETE FROM auth WHERE key = $1', [k]) },
    async clearAuthPrefix(p) { await pool.query('DELETE FROM auth WHERE left(key, char_length($1)) = $1', [p]) },
    async close() { await pool.end() },
  }
}

async function init() {
  if (driver) return driver
  driver = config.DATABASE_URL ? await pgDriver() : sqliteDriver()
  return driver
}

const get = () => {
  if (!driver) throw new Error('storage.init() doit être appelé avant utilisation')
  return driver
}

module.exports = { init, get, name: () => driver?.name }
