import { useEffect, useState } from 'react'
import Lock from './pages/Lock.jsx'
import VaultView from './pages/VaultView.jsx'

// Top-level state machine: loading → (initialize | unlock) → vault.
export default function App() {
  const [status, setStatus] = useState(null)

  async function refresh() {
    setStatus(await window.vault.status())
  }

  useEffect(() => {
    refresh()
    // Auto-lock from the main process bounces us back to the lock screen.
    window.vault.onLocked(() => refresh())
  }, [])

  if (!status) return <div className="center"><p className="muted">Loading…</p></div>

  if (status.locked) {
    return <Lock initialized={status.initialized} onUnlocked={refresh} />
  }
  return <VaultView autoLockMinutes={status.autoLockMinutes} onLock={refresh} />
}
