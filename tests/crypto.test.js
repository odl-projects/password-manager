// Validates the zero-knowledge crypto core without launching Electron.
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const {
  deriveKey, generateSalt, encrypt, decrypt, makeVerifier, checkVerifier, generatePassword,
} = require('../src/main/crypto.js')

test('AES-256-GCM round-trips with the derived key', () => {
  const salt = generateSalt()
  const key = deriveKey('correct horse battery staple', salt, 50000) // fewer iters for test speed
  const payload = encrypt('s3cr3t-value', key)
  assert.strictEqual(decrypt(payload, key), 's3cr3t-value')
})

test('wrong master password cannot decrypt (zero-knowledge property)', () => {
  const salt = generateSalt()
  const right = deriveKey('right-password', salt, 50000)
  const wrong = deriveKey('wrong-password', salt, 50000)
  const payload = encrypt('vault-data', right)
  assert.throws(() => decrypt(payload, wrong))
})

test('verifier confirms the master password without storing it', () => {
  const salt = generateSalt()
  const key = deriveKey('master', salt, 50000)
  const verifier = makeVerifier(key)
  assert.ok(checkVerifier(verifier, key))
  const wrong = deriveKey('nope', salt, 50000)
  assert.strictEqual(checkVerifier(verifier, wrong), false)
})

test('tampered ciphertext is rejected by GCM auth tag', () => {
  const salt = generateSalt()
  const key = deriveKey('master', salt, 50000)
  const payload = JSON.parse(encrypt('data', key))
  // Flip a byte in the ciphertext.
  const ct = Buffer.from(payload.ct, 'base64')
  ct[0] ^= 0xff
  payload.ct = ct.toString('base64')
  assert.throws(() => decrypt(JSON.stringify(payload), key))
})

test('password generator honours length and character sets', () => {
  const pw = generatePassword({ length: 32, symbols: false, upper: true, lower: true, digits: true })
  assert.strictEqual(pw.length, 32)
  assert.ok(!/[!@#$%^&*]/.test(pw))
  assert.match(generatePassword({ length: 16 }), /^.{16}$/)
})
