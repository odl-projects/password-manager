// Secure bridge: exposes a minimal, explicit vault API to the renderer.
// contextIsolation keeps Node out of the renderer; only these methods cross over.
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('vault', {
  status: () => ipcRenderer.invoke('vault:status'),
  initialize: (masterPassword) => ipcRenderer.invoke('vault:initialize', masterPassword),
  unlock: (masterPassword) => ipcRenderer.invoke('vault:unlock', masterPassword),
  lock: () => ipcRenderer.invoke('vault:lock'),
  list: () => ipcRenderer.invoke('vault:list'),
  add: (entry) => ipcRenderer.invoke('vault:add', entry),
  update: (id, entry) => ipcRenderer.invoke('vault:update', id, entry),
  remove: (id) => ipcRenderer.invoke('vault:remove', id),
  changeMaster: (oldP, newP) => ipcRenderer.invoke('vault:changeMaster', oldP, newP),
  exportEncrypted: (passphrase) => ipcRenderer.invoke('vault:export', passphrase),
  importEncrypted: (bundle, passphrase) => ipcRenderer.invoke('vault:import', bundle, passphrase),
  generatePassword: (opts) => ipcRenderer.invoke('util:generatePassword', opts),
  setAutoLock: (minutes) => ipcRenderer.invoke('util:setAutoLock', minutes),
  copyPassword: (value) => ipcRenderer.invoke('util:copyPassword', value),
  onLocked: (cb) => ipcRenderer.on('vault:locked', cb),
})
