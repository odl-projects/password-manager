import { useEffect, useState } from 'react'
import EntryForm from './EntryForm.jsx'
import Settings from './Settings.jsx'

const EMPTY = { title: '', username: '', password: '', url: '', notes: '' }

export default function VaultView({ onLock }) {
  const [entries, setEntries] = useState([])
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null) // entry object or EMPTY for new
  const [showSettings, setShowSettings] = useState(false)
  const [filter, setFilter] = useState('')
  const [toast, setToast] = useState('')

  async function load() {
    setEntries(await window.vault.list())
  }
  useEffect(() => { load() }, [])

  async function save(entry) {
    if (entry.id) await window.vault.update(entry.id, entry)
    else await window.vault.add(entry)
    setEditing(null)
    await load()
  }

  async function remove(id) {
    if (!confirm('Delete this entry?')) return
    await window.vault.remove(id)
    setSelected(null)
    await load()
  }

  async function copy(value) {
    const { clearsInSeconds } = await window.vault.copyPassword(value)
    setToast(`Copied — clipboard clears in ${clearsInSeconds}s`)
    setTimeout(() => setToast(''), 3000)
  }

  async function lock() {
    await window.vault.lock()
    onLock()
  }

  const shown = entries.filter((e) =>
    (e.title + e.username + e.url).toLowerCase().includes(filter.toLowerCase()))

  if (showSettings) return <Settings onClose={() => setShowSettings(false)} onLock={lock} />

  return (
    <>
      <div className="topbar">
        <strong>🔐 Vault</strong>
        <span className="tag">{entries.length} entries</span>
        <span className="spacer" />
        {toast && <span className="ok">{toast}</span>}
        <button onClick={() => setEditing(EMPTY)}>+ New</button>
        <button className="secondary" onClick={() => setShowSettings(true)}>Settings</button>
        <button className="ghost" onClick={lock}>Lock</button>
      </div>

      {editing ? (
        <div className="detail">
          <EntryForm entry={editing} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      ) : (
        <div className="layout">
          <div className="list">
            <input placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ margin: '0.6rem', width: 'calc(100% - 1.2rem)' }} />
            {shown.map((e) => (
              <div key={e.id} className={`item ${selected?.id === e.id ? 'active' : ''}`} onClick={() => setSelected(e)}>
                <div><strong>{e.title || '(untitled)'}</strong></div>
                <div className="muted">{e.username}</div>
              </div>
            ))}
            {shown.length === 0 && <p className="muted" style={{ padding: '1rem' }}>No entries.</p>}
          </div>

          <div className="detail">
            {!selected && <p className="muted">Select an entry, or create a new one.</p>}
            {selected && (
              <div>
                <div className="row"><h1>{selected.title}</h1><span className="spacer" />
                  <button className="secondary" onClick={() => setEditing(selected)}>Edit</button>
                  <button className="ghost danger" onClick={() => remove(selected.id)}>Delete</button>
                </div>
                <Field label="Username" value={selected.username} onCopy={copy} />
                <Field label="Password" value={selected.password} secret onCopy={copy} />
                <Field label="URL" value={selected.url} />
                <div className="field"><label>Notes</label><div>{selected.notes || '—'}</div></div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, value, secret, onCopy }) {
  const [show, setShow] = useState(false)
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <span style={{ fontFamily: secret && !show ? 'monospace' : 'inherit' }}>
          {secret && !show ? '••••••••••••' : value || '—'}
        </span>
        <span className="spacer" />
        {secret && <button className="ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>}
        {value && onCopy && <button className="ghost" onClick={() => onCopy(value)}>Copy</button>}
      </div>
    </div>
  )
}
