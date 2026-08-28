// Zero-knowledge crypto core. Pure Node `crypto` — no third-party crypto lib.
//
// Security model (proposal §2.4):
//   - The AES-256 vault key is DERIVED from the master password with
//     PBKDF2-SHA256 at >= 600,000 iterations (OWASP 2023) and a random salt.
//   - Entries are encrypted with AES-256-GCM (authenticated encryption,
//     NIST SP 800-38D) so tampering is detected on decrypt.
//   - The derived key lives only in memory during an unlocked session; it is
//     never written to disk. Only ciphertext + salt + a verifier are persisted.
'use strict'
const crypto = require('node:crypto')

const PBKDF2_ITERATIONS = 600000
const KEY_LEN = 32 // 256-bit
const SALT_LEN = 16
const IV_LEN = 12
const DIGEST = 'sha256'

function generateSalt() {
  return crypto.randomBytes(SALT_LEN)
}

// Derive the AES-256 key from the master password + salt.
function deriveKey(masterPassword, salt, iterations = PBKDF2_ITERATIONS) {
  return crypto.pbkdf2Sync(Buffer.from(masterPassword, 'utf8'), salt, iterations, KEY_LEN, DIGEST)
}

// Encrypt a UTF-8 string → base64 payload {iv, tag, ct}.
function encrypt(plaintext, key) {
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  })
}

// Decrypt a payload produced by encrypt(). Throws if the key is wrong or data
// was tampered with (GCM auth failure).
function decrypt(payload, key) {
  const { iv, tag, ct } = JSON.parse(payload)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()])
  return pt.toString('utf8')
}

// A verifier lets us confirm the master password on unlock without storing it:
// encrypt a known constant; if it decrypts cleanly, the password is correct.
const VERIFIER_PLAINTEXT = 'vault-ok'
function makeVerifier(key) {
  return encrypt(VERIFIER_PLAINTEXT, key)
}
function checkVerifier(verifier, key) {
  try {
    return decrypt(verifier, key) === VERIFIER_PLAINTEXT
  } catch {
    return false
  }
}

// Cryptographically strong password generator.
function generatePassword({ length = 20, lower = true, upper = true, digits = true, symbols = true } = {}) {
  let pool = ''
  if (lower) pool += 'abcdefghijklmnopqrstuvwxyz'
  if (upper) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (digits) pool += '0123456789'
  if (symbols) pool += '!@#$%^&*()-_=+[]{};:,.<>?'
  if (!pool) throw new Error('At least one character set must be enabled.')
  const out = []
  for (let i = 0; i < length; i++) {
    out.push(pool[crypto.randomInt(pool.length)]) // unbiased CSPRNG
  }
  return out.join('')
}

module.exports = {
  PBKDF2_ITERATIONS,
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  makeVerifier,
  checkVerifier,
  generatePassword,
}
