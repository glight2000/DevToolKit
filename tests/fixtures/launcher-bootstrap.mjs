import { BrowserWindow, globalShortcut, shell } from 'electron'
const shortcuts = new Map()
globalThis.launcherConflict = false
globalThis.launcherExternal = []
globalShortcut.register = (key, callback) => { if (globalThis.launcherConflict || shortcuts.has(key)) return false; shortcuts.set(key, callback); return true }
globalShortcut.unregister = key => shortcuts.delete(key)
globalShortcut.isRegistered = key => shortcuts.has(key)
globalThis.triggerLauncherShortcut = key => shortcuts.get(key)?.()
shell.openPath = async path => { globalThis.launcherExternal.push({ path }); return '' }
shell.openExternal = async url => { globalThis.launcherExternal.push({ url }) }
await import('./desktop-bootstrap.mjs')
const visible = new Set()
BrowserWindow.prototype.show = function () { visible.add(this.id) }
BrowserWindow.prototype.showInactive = function () { visible.add(this.id) }
BrowserWindow.prototype.hide = function () { visible.delete(this.id) }
BrowserWindow.prototype.isVisible = function () { return visible.has(this.id) }
