import { useState } from 'react'

export default function EntryForm({ entry, onSave, onCancel }) {
  const [form, setForm] = useState({ ...entry })
  const [genOpts, setGenOpts] = useState({ length: 20, upper: true, lower: true, digits: true, symbols: true })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function generate() {
    const pw = await window.vault.generatePassword(genOpts)
    setForm({ ...form, password: pw })
  }

  return (
    <div className="card" style={{ width: 520 }}>
      <h1>{form.id ? 'Edit entry' : 'New entry'}</h1>
      <div className="field"><label>Title</label><input value={form.title} onChange={set('title')} autoFocus /></div>
      <div className="field"><label>Username / email</label><input value={form.username} onChange={set('username')} /></div>
      <div className="field">
        <label>Password</label>
        <div className="row">
          <input value={form.password} onChange={set('password')} />
          <button type="button" className="secondary" onClick={generate}>Generate</button>
        </div>
        <div className="row muted" style={{ marginTop: 4 }}>
          <span>Len</span>
          <input type="number" min="8" max="64" value={genOpts.length}
            onChange={(e) => setGenOpts({ ...genOpts, length: Number(e.target.value) })} style={{ width: 70 }} />
          {['upper', 'lower', 'digits', 'symbols'].map((k) => (
            <label key={k} className="row" style={{ width: 'auto' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={genOpts[k]}
                onChange={(e) => setGenOpts({ ...genOpts, [k]: e.target.checked })} /> {k}
            </label>
          ))}
        </div>
      </div>
      <div className="field"><label>URL</label><input value={form.url} onChange={set('url')} /></div>
      <div className="field"><label>Notes</label><textarea value={form.notes} onChange={set('notes')} rows={3} style={{ width: '100%' }} /></div>
      <div className="row">
        <button onClick={() => onSave(form)}>Save</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
