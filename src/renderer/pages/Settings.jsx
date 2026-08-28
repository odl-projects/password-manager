import { useState } from 'react'

export default function Settings({ onClose, onLock }) {
  const [minutes, setMinutes] = useState(5)
  const [oldP, setOldP] = useState('')
  const [newP, setNewP] = useState('')
  const [msg, setMsg] = useState('')
  const [exportPass, setExportPass] = useState('')

  async function saveAutoLock() {
    await window.vault.setAutoLock(minutes)
    setMsg(`Auto-lock set to ${minutes} min.`)
  }

  async function changeMaster() {
    setMsg('')
    try {
      await window.vault.changeMaster(oldP, newP)
      setMsg('Master password changed — vault re-encrypted.')
      setOldP(''); setNewP('')
    } catch (e) {
      setMsg('✗ ' + e.message)
    }
  }

  async function doExport() {
    const bundle = await window.vault.exportEncrypted(exportPass || 'changeme')
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'vault-export.json'
    a.click()
    setMsg('Encrypted vault exported.')
  }

  async function doImport(e) {
    const file = e.target.files[0]
    if (!file) return
    const bundle = JSON.parse(await file.text())
    const { count } = await window.vault.importEncrypted(bundle, exportPass || 'changeme')
    setMsg(`Imported ${count} entries.`)
  }

  return (
    <div className="detail">
      <div className="row"><h1>Settings</h1><span className="spacer" /><button className="secondary" onClick={onClose}>← Back</button></div>
      {msg && <p className={msg.startsWith('✗') ? 'danger' : 'ok'}>{msg}</p>}

      <div className="card" style={{ width: 520, marginBottom: '1rem' }}>
        <h2>Auto-lock</h2>
        <div className="row">
          <input type="number" min="1" max="60" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ width: 90 }} />
          <span className="muted">minutes of inactivity</span>
          <button onClick={saveAutoLock}>Save</button>
          <button className="ghost" onClick={onLock}>Lock now</button>
        </div>
      </div>

      <div className="card" style={{ width: 520, marginBottom: '1rem' }}>
        <h2>Change master password</h2>
        <input type="password" placeholder="Current master password" value={oldP} onChange={(e) => setOldP(e.target.value)} />
        <input type="password" placeholder="New master password" value={newP} onChange={(e) => setNewP(e.target.value)} />
        <button onClick={changeMaster}>Change & re-encrypt</button>
      </div>

      <div className="card" style={{ width: 520 }}>
        <h2>Encrypted import / export</h2>
        <input type="password" placeholder="Export/import passphrase" value={exportPass} onChange={(e) => setExportPass(e.target.value)} />
        <div className="row">
          <button onClick={doExport}>Export vault</button>
          <label className="secondary" style={{ padding: '0.6rem 0.8rem', borderRadius: 8, cursor: 'pointer' }}>
            Import…<input type="file" accept="application/json" onChange={doImport} style={{ display: 'none' }} />
          </label>
        </div>
        <p className="muted">Exports are AES-256-GCM encrypted with the passphrase above — never plaintext.</p>
      </div>
    </div>
  )
}
