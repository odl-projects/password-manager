// Electron main process: owns the encrypted vault and all crypto. The renderer
// never sees the master key — it talks to the vault only through validated IPC.
'use strict'
const path = require('node:path')
const { app, BrowserWindow, ipcMain, clipboard } = require('electron')
const { openVault } = require('./vault.js')
const { generatePassword } = require('./crypto.js')

let win = null
let vault = null
let autoLockTimer = null
let autoLockMinutes = 5
let clipboardClearTimer = null

function resetAutoLock() {
  if (autoLockTimer) clearTimeout(autoLockTimer)
  if (!vault || vault.isLocked()) return
  autoLockTimer = setTimeout(() => {
    vault.lock()
    win?.webContents.send('vault:locked')
  }, autoLockMinutes * 60 * 1000)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1024,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) win.loadURL(devUrl)
  else win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  vault = openVault(app.getPath('userData'))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerIpc() {
  ipcMain.handle('vault:status', () => ({
    initialized: vault.isInitialized(),
    locked: vault.isLocked(),
    autoLockMinutes,
  }))

  ipcMain.handle('vault:initialize', (_e, masterPassword) => {
    vault.initialize(masterPassword)
    resetAutoLock()
    return { ok: true }
  })

  ipcMain.handle('vault:unlock', (_e, masterPassword) => {
    const ok = vault.unlock(masterPassword)
    if (ok) resetAutoLock()
    return { ok }
  })

  ipcMain.handle('vault:lock', () => {
    vault.lock()
    if (autoLockTimer) clearTimeout(autoLockTimer)
    return { ok: true }
  })

  ipcMain.handle('vault:list', () => { resetAutoLock(); return vault.list() })
  ipcMain.handle('vault:add', (_e, entry) => { resetAutoLock(); return vault.add(entry) })
  ipcMain.handle('vault:update', (_e, id, entry) => { resetAutoLock(); return vault.update(id, entry) })
  ipcMain.handle('vault:remove', (_e, id) => { resetAutoLock(); vault.remove(id); return { ok: true } })

  ipcMain.handle('vault:changeMaster', (_e, oldP, newP) => {
    vault.changeMasterPassword(oldP, newP)
    return { ok: true }
  })

  ipcMain.handle('vault:export', (_e, passphrase) => vault.exportEncrypted(passphrase))
  ipcMain.handle('vault:import', (_e, bundle, passphrase) => ({ count: vault.importEncrypted(bundle, passphrase) }))

  ipcMain.handle('util:generatePassword', (_e, opts) => generatePassword(opts))

  ipcMain.handle('util:setAutoLock', (_e, minutes) => {
    autoLockMinutes = Math.max(1, Number(minutes) || 5)
    resetAutoLock()
    return { autoLockMinutes }
  })

  // Copy to clipboard and auto-clear after 30s (proposal: clipboard exposure mitigation).
  ipcMain.handle('util:copyPassword', (_e, value) => {
    clipboard.writeText(value)
    if (clipboardClearTimer) clearTimeout(clipboardClearTimer)
    clipboardClearTimer = setTimeout(() => {
      if (clipboard.readText() === value) clipboard.clear()
    }, 30 * 1000)
    return { ok: true, clearsInSeconds: 30 }
  })
}
