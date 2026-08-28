# Password Manager with Zero-Knowledge Encryption

Implementation of the ZUCT 2026 proposal (`Group10_Password_Manager_Full_Proposal`).

A cross-platform **desktop** password manager where **all encryption happens on
your device**. The master password derives the vault key via PBKDF2; entries are
stored as AES-256-GCM ciphertext in a local SQLite file. Nothing secret is ever
written to disk in plaintext, and there is **no server** — the zero-knowledge
property here is structural, not a promise: there is no party other than you who
could decrypt the vault, because the key exists only in memory on your machine
while the vault is unlocked.

---

## Contents

- [Security model](#security-model)
- [Architecture](#architecture)
- [Features](#features)
- [Technology stack](#technology-stack)
- [Project layout](#project-layout)
- [Prerequisites](#prerequisites)
- [Running the app](#running-the-app)
- [First run — a complete walkthrough](#first-run--a-complete-walkthrough)
- [Running the tests](#running-the-tests)
- [The vault API](#the-vault-api)
- [Objectives traceability](#objectives-traceability)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

---

## Security model

| Control | Implementation |
|---|---|
| **Key derivation** | PBKDF2-SHA256, **600 000 iterations** (OWASP 2023), random 16-byte salt, 256-bit output. |
| **Encryption** | AES-256-GCM with a random 96-bit IV per record — authenticated, so tampering is detected on decrypt (NIST SP 800-38D). |
| **Master-password check** | A *verifier* ciphertext is decrypted on unlock. The password itself is never stored, in any form. |
| **Key lifetime** | The derived key lives only in main-process memory while unlocked, and is dropped on lock and on auto-lock. |
| **Process isolation** | Crypto and the database live in the Electron **main** process. The renderer reaches them only through a locked-down `contextBridge` IPC surface, with `contextIsolation: true` and `nodeIntegration: false`. |
| **Clipboard hygiene** | Copied passwords auto-clear after 30 seconds — and only if the clipboard still holds that value, so a later copy is not destroyed. |
| **Auto-lock** | The vault locks and purges the key after N minutes of inactivity (5 by default, minimum 1). |

What reaches the disk is only ever: the PBKDF2 salt, the iteration count, the
verifier ciphertext, and one AES-256-GCM blob per entry. The **entire** entry —
title, username, password, URL and notes together — is encrypted as a single JSON
blob, so the database leaks no metadata about which sites you hold credentials
for. Only the record id and its update timestamp are stored in clear.

## Architecture

```
  RENDERER (React, sandboxed)              MAIN PROCESS (Node)
  ───────────────────────────              ───────────────────
  Lock · VaultView · EntryForm             crypto.js   PBKDF2 · AES-256-GCM · CSPRNG
  Settings                                 vault.js    SQLite vault, CRUD, rotate, export
        │                                  index.js    IPC, auto-lock, clipboard clear
        │                                        │
        └──── window.vault.* ────────────────────┘         ┌──────────────┐
              contextBridge IPC                  ─────────►│  vault.db    │
              (the only surface)                           │  ciphertext  │
                                                           │  only        │
  no key, no Node, no DB access                            └──────────────┘
```

The renderer holds no key, has no Node access, and cannot reach SQLite. Every
capability it has is one of the fourteen methods explicitly listed in
`src/preload/index.js`.

The vault file lives in Electron's per-user data directory
(`app.getPath('userData')/vault.db`), not in the project folder — so it survives
a rebuild and is never at risk of being committed.

## Features

- Master-password create / unlock / change — changing it re-derives a new key with
  a fresh salt and re-encrypts every entry inside a single transaction.
- Add, view, edit and delete credentials (title, username, password, URL, notes).
- CSPRNG password generator — configurable length and character sets, using
  `crypto.randomInt` for unbiased selection.
- Copy to clipboard with 30-second auto-clear.
- Inactivity auto-lock, configurable from the Settings page.
- Encrypted vault export and import: the bundle is re-encrypted under a separate
  passphrase with its own salt, so it is portable while remaining ciphertext-only.

### A note on "user management"

By design this is a **single-user, local-only** application — zero cloud, zero
server — so there is no server-side administration. The account lifecycle here *is*
the master-password lifecycle: set, unlock, change, lock, all enforced locally.

## Technology stack

| Layer | Choice |
|---|---|
| Shell | Electron 31 |
| UI | React 18 built by Vite 5 (renderer dev server on port 5175) |
| Cryptography | Node's built-in `node:crypto` — no third-party crypto library |
| Storage | SQLite via `better-sqlite3` 11, in WAL mode |
| Tests | Node's built-in test runner (`node --test`) |

## Project layout

```
password-manager/
├── .gitignore
├── README.md
├── src/
│   ├── main/
│   │   ├── crypto.js       # PBKDF2 + AES-256-GCM + CSPRNG generator (pure Node)
│   │   ├── vault.js        # Encrypted SQLite vault: CRUD, rotate, export/import
│   │   └── index.js        # Electron main: IPC, auto-lock, clipboard auto-clear
│   ├── preload/index.js    # contextBridge — the only renderer↔main surface
│   └── renderer/           # React UI: Lock, VaultView, EntryForm, Settings
├── tests/crypto.test.js    # Crypto correctness + zero-knowledge property tests
├── vite.config.js
└── package.json
```

The repository root also holds the academic deliverables — the proposal, the final
report, the presentation and the institutional template — alongside
`instructions.txt`, which is the report-generation brief rather than part of the
application.

### Data model

Two SQLite tables, both ciphertext-only:

| Table | Columns | Holds |
|---|---|---|
| `meta` | `key`, `value` | The PBKDF2 salt, the iteration count, and the verifier ciphertext. |
| `entries` | `id`, `blob`, `updated_at` | One AES-256-GCM blob per credential; the id is a random UUID. |

## Prerequisites

- **Node.js 18+** and npm
- A C/C++ toolchain for the `better-sqlite3` native build — on Windows this comes
  with Visual Studio Build Tools; on macOS with the Xcode command-line tools; on
  Linux with `build-essential`

## Running the app

```bash
npm install            # builds better-sqlite3 and fetches Electron
npm test               # crypto + zero-knowledge tests (no Electron needed)
npm run dev            # Vite renderer on :5175 + the Electron shell
```

`npm run dev` runs both halves concurrently: Vite serves the renderer, and Electron
waits for port 5175 before launching and pointing at it.

For a production-style run — the renderer built to `./dist` and loaded over
`file://` rather than from the dev server:

```bash
npm run build:renderer
npm start
```

> `better-sqlite3` is a native module compiled against Electron's ABI. `npm install`
> runs `electron-rebuild` automatically via a `postinstall` hook; if the native
> module still fails to load, run `npm run rebuild`. The crypto core and its tests
> run under plain Node and need no native build at all.

## First run — a complete walkthrough

1. `npm run dev`. The window opens on the **Lock** screen. Because no vault exists
   yet, it asks you to *create* a master password rather than enter one. Choose it
   carefully — see the warning below.
2. Creating it generates a random salt, derives the key at 600 000 PBKDF2
   iterations, and stores the salt and verifier. The vault is now unlocked.
3. Add an entry from **VaultView**. Use the generator to produce a password rather
   than typing one, then save — the whole record is encrypted before it reaches
   SQLite.
4. Copy the password. The status line confirms the clipboard will clear in 30
   seconds; wait and paste somewhere to see that it has.
5. Open **Settings** and set auto-lock to 1 minute. Leave the app idle and watch it
   lock itself and discard the key.
6. Unlock again, then change the master password. Every entry is re-encrypted under
   the new key in one transaction; the old key becomes useless.
7. Export the vault with a separate passphrase, then import the bundle back to
   confirm the round trip.

> **Forgetting the master password means losing the vault.** There is no backdoor,
> no recovery code, and no copy of the key anywhere. Keep an encrypted export as
> your backup.

## Running the tests

```bash
npm test
```

Five tests run against the crypto core, under plain Node with no Electron and no
native modules:

| Test | Proves |
|---|---|
| AES-256-GCM round-trips with the derived key | Encryption and decryption are inverse under the same derived key. |
| Wrong master password cannot decrypt | The zero-knowledge property — a different password yields a different key, and decryption fails. |
| Verifier confirms the master password without storing it | Unlock can validate a password with nothing but ciphertext on disk. |
| Tampered ciphertext is rejected by the GCM auth tag | Flipping one byte of ciphertext makes decryption throw rather than return corrupt data. |
| Password generator honours length and character sets | The CSPRNG generator respects its configuration. |

The tests derive keys at 50 000 iterations rather than 600 000 purely for speed;
production code paths always use the full count.

## The vault API

The renderer's entire capability surface, exposed as `window.vault.*`:

| Method | Purpose |
|---|---|
| `status()` | Whether the vault is initialised, locked, and the auto-lock interval |
| `initialize(masterPassword)` | First-run: set the master password |
| `unlock(masterPassword)` | Derive the key and check it against the verifier |
| `lock()` | Drop the key from memory |
| `list()` | Decrypt and return all entries, newest first |
| `add(entry)` | Encrypt and store a new credential |
| `update(id, entry)` | Merge into an existing entry and re-encrypt |
| `remove(id)` | Delete an entry |
| `changeMaster(old, new)` | Re-key the vault and re-encrypt everything |
| `exportEncrypted(passphrase)` | Produce a passphrase-encrypted bundle |
| `importEncrypted(bundle, passphrase)` | Decrypt a bundle and add its entries |
| `generatePassword(opts)` | CSPRNG password generation |
| `setAutoLock(minutes)` | Change the inactivity timeout |
| `copyPassword(value)` | Copy to clipboard with a 30-second auto-clear |
| `onLocked(cb)` | Notified when auto-lock fires |

Every method that touches the vault asserts it is unlocked first, and resets the
auto-lock timer.

## Objectives traceability

| # | Proposal objective | Where it is implemented | Verified by |
|---|---|---|---|
| 1 | PBKDF2 key-derivation module with configurable iterations, brute-force resistant | `src/main/crypto.js` — `deriveKey`, 600 k iterations, random salt | `tests/crypto.test.js` (derivation + verifier) |
| 2 | Client-side AES-256 engine; no server ever receives plaintext | `src/main/crypto.js` (AES-256-GCM), `src/main/vault.js` (ciphertext-only storage) | `tests/crypto.test.js` (round-trip, wrong password, tamper) |
| 3 | Cross-platform Electron + React vault with encrypted SQLite | `src/main/vault.js` (better-sqlite3), `src/renderer/` (React UI) | Renderer builds; vault flow exercised manually under Node |

**Test evidence:** `npm test` → 5 passing. The vault layer itself has been walked
through manually under Node (initialise → add → lock → unlock → master-password
rotation → encrypted export); that path has no automated coverage yet.

## Troubleshooting

**`better-sqlite3` fails to load, or reports an ABI/`NODE_MODULE_VERSION`
mismatch.** It is a native module compiled against Electron's ABI. Run
`npm run rebuild` (which is `electron-rebuild -f -w better-sqlite3`). The crypto
core and its tests need no native build, so `npm test` will pass regardless.

**`npm install` fails while building the native module.** Install a C/C++
toolchain first: Visual Studio Build Tools on Windows, the Xcode command-line tools
on macOS, `build-essential` on Linux.

**The Electron window is blank in dev.** Electron waits for the Vite server on port
5175. If that port is already taken, Vite moves and Electron points at the wrong
place — free the port and rerun `npm run dev`.

**The window is blank after `npm start`.** `npm start` loads `./dist` over
`file://`. Run `npm run build:renderer` first, or use `npm start`, which does both.

**Unlock always fails though the password is right.** The vault is keyed to its
salt. If `vault.db` was replaced or copied from another machine's user-data
directory, the salt no longer matches the password you are typing.

**Forgot the master password.** By design it is unrecoverable — there is no
backdoor and the key is never stored. Restore from an encrypted export, or start a
new vault.

## Known limitations

These are scope boundaries of the current build rather than defects:

- **The key is nulled, not zeroed.** `lock()` drops the reference to the derived
  key, but the Node `Buffer` holding it is not overwritten, so the bytes may remain
  in process memory until garbage collection. A memory dump of a recently-locked
  process could still yield the key.
- **PBKDF2 is not memory-hard.** 600 000 iterations meets the OWASP 2023 guidance,
  but PBKDF2 parallelises well on GPUs. Argon2id or scrypt would raise the cost of
  an offline attack against a weak master password considerably.
- **Per-record integrity, not whole-vault integrity.** GCM authenticates each entry
  individually. An attacker with write access to `vault.db` cannot alter or forge an
  entry, but can delete entries or roll the file back to an earlier state without
  detection.
- **Import does not deduplicate.** `importEncrypted` adds every entry in the bundle
  as a new record, so importing the same bundle twice produces duplicates.
- **The stored iteration count is read on unlock but not rewritten on re-key.**
  `changeMasterPassword` derives the new key with the compiled-in default and does
  not update the `iterations` value in `meta`. The two agree today because
  `initialize` always writes the same default, but raising the default later would
  strand existing vaults — the re-key path should write the count it actually used.
- **Automated coverage stops at the crypto core.** The vault layer, the IPC surface
  and the auto-lock timer have no automated tests.
- **No packaging configuration.** `npm start` runs Electron from the source tree;
  there is no `electron-builder` or `electron-forge` setup, so there are no
  installers or signed binaries for the platforms the app otherwise supports.
- **No clipboard protection beyond the timer.** Other applications can read the
  clipboard during the 30-second window, and some clipboard-history tools will
  retain the value after it is cleared.
