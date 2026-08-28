// Encrypted vault backed by SQLite (better-sqlite3). Each credential entry is
// stored as an AES-256-GCM ciphertext blob; only ciphertext, the PBKDF2 salt,
// and a verifier ever touch disk. The derived key is held in memory only while
// the vault is unlocked.
'use strict'
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')
const {
  deriveKey, encrypt, decrypt, generateSalt, makeVerifier, checkVerifier, PBKDF2_ITERATIONS,
} = require('./crypto.js')

class Vault {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        blob TEXT NOT NULL,           -- AES-256-GCM ciphertext of the entry JSON
        updated_at INTEGER NOT NULL
      );
    `)
    this.key = null // in-memory derived key; null when locked
  }

  _meta(key) {
    return this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value
  }
  _setMeta(key, value) {
    this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=?')
      .run(key, value, value)
  }

  isInitialized() {
    return Boolean(this._meta('salt') && this._meta('verifier'))
  }
  isLocked() {
    return this.key === null
  }

  // First-run: set the master password.
  initialize(masterPassword) {
    if (this.isInitialized()) throw new Error('Vault already initialized.')
    const salt = generateSalt()
    const key = deriveKey(masterPassword, salt)
    this._setMeta('salt', salt.toString('base64'))
    this._setMeta('iterations', String(PBKDF2_ITERATIONS))
    this._setMeta('verifier', makeVerifier(key))
    this.key = key
  }

  unlock(masterPassword) {
    const salt = Buffer.from(this._meta('salt'), 'base64')
    const iterations = Number(this._meta('iterations') || PBKDF2_ITERATIONS)
    const key = deriveKey(masterPassword, salt, iterations)
    if (!checkVerifier(this._meta('verifier'), key)) return false
    this.key = key
    return true
  }

  lock() {
    this.key = null // drop the derived key from memory
  }

  _assertUnlocked() {
    if (this.isLocked()) throw new Error('Vault is locked.')
  }

  list() {
    this._assertUnlocked()
    return this.db.prepare('SELECT id, blob, updated_at FROM entries ORDER BY updated_at DESC')
      .all()
      .map((row) => ({ id: row.id, updatedAt: row.updated_at, ...JSON.parse(decrypt(row.blob, this.key)) }))
  }

  add(entry) {
    this._assertUnlocked()
    const id = crypto.randomUUID()
    const record = {
      title: entry.title || '',
      username: entry.username || '',
      password: entry.password || '',
      url: entry.url || '',
      notes: entry.notes || '',
    }
    this.db.prepare('INSERT INTO entries(id, blob, updated_at) VALUES(?,?,?)')
      .run(id, encrypt(JSON.stringify(record), this.key), Date.now())
    return { id, ...record }
  }

  update(id, entry) {
    this._assertUnlocked()
    const existing = this.db.prepare('SELECT blob FROM entries WHERE id = ?').get(id)
    if (!existing) throw new Error('Entry not found.')
    const current = JSON.parse(decrypt(existing.blob, this.key))
    const merged = { ...current, ...entry }
    this.db.prepare('UPDATE entries SET blob = ?, updated_at = ? WHERE id = ?')
      .run(encrypt(JSON.stringify(merged), this.key), Date.now(), id)
    return { id, ...merged }
  }

  remove(id) {
    this._assertUnlocked()
    this.db.prepare('DELETE FROM entries WHERE id = ?').run(id)
  }

  changeMasterPassword(oldPassword, newPassword) {
    if (!this.unlock(oldPassword)) throw new Error('Current master password is incorrect.')
    const entries = this.list() // decrypt all with old key
    const salt = generateSalt()
    const newKey = deriveKey(newPassword, salt)
    const tx = this.db.transaction(() => {
      this._setMeta('salt', salt.toString('base64'))
      this._setMeta('verifier', makeVerifier(newKey))
      for (const e of entries) {
        const { id, updatedAt, ...rec } = e
        this.db.prepare('UPDATE entries SET blob = ? WHERE id = ?')
          .run(encrypt(JSON.stringify(rec), newKey), id)
      }
    })
    tx()
    this.key = newKey
  }

  // Encrypted export: portable, still ciphertext-only (re-encrypted with a passphrase).
  exportEncrypted(passphrase) {
    this._assertUnlocked()
    const salt = generateSalt()
    const key = deriveKey(passphrase, salt)
    const payload = JSON.stringify(this.list().map(({ updatedAt, ...e }) => e))
    return { salt: salt.toString('base64'), data: encrypt(payload, key) }
  }

  importEncrypted(bundle, passphrase) {
    this._assertUnlocked()
    const key = deriveKey(passphrase, Buffer.from(bundle.salt, 'base64'))
    const entries = JSON.parse(decrypt(bundle.data, key))
    for (const e of entries) {
      const { id, ...rest } = e
      this.add(rest)
    }
    return entries.length
  }
}

function openVault(userDataDir) {
  return new Vault(path.join(userDataDir, 'vault.db'))
}

module.exports = { Vault, openVault }
