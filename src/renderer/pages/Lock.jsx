import { useState } from 'react'

// First run sets the master password; subsequent runs unlock with it.
export default function Lock({ initialized, onUnlocked }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      if (!initialized) {
        if (pw.length < 8) throw new Error('Master password must be at least 8 characters.')
        if (pw !== confirm) throw new Error('Passwords do not match.')
        await window.vault.initialize(pw)
        onUnlocked()
      } else {
        const { ok } = await window.vault.unlock(pw)
        if (!ok) throw new Error('Incorrect master password.')
        onUnlocked()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1>🔒 {initialized ? 'Unlock vault' : 'Create your vault'}</h1>
        <p className="muted">
          {initialized
            ? 'Enter your master password. It never leaves this device.'
            : 'Choose a strong master password. It derives your encryption key via PBKDF2 (600k iterations) and is never stored.'}
        </p>
        <input type="password" placeholder="Master password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {!initialized && (
          <input type="password" placeholder="Confirm master password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        )}
        {error && <p className="danger">{error}</p>}
        <button type="submit" disabled={busy}>{initialized ? 'Unlock' : 'Create vault'}</button>
      </form>
    </div>
  )
}
