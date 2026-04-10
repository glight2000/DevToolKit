import { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { PluginHost } from './plugin-host'
import { DatabaseManager } from './lib/db'
import {
  getWindowBounds,
  saveWindowBounds,
  getActivePluginId,
  saveActivePluginId,
  getSidebarCollapsed,
  saveSidebarCollapsed,
  getTheme,
  saveTheme,
  type Theme
} from './lib/store'

// Import all plugins
import { sshTunnelPlugin } from './plugins/ssh-tunnel'
import { notebookPlugin } from './plugins/notebook'
import { cryptoToolsPlugin } from './plugins/crypto-tools'
import { timeToolsPlugin } from './plugins/time-tools'
import { translationPlugin } from './plugins/translation'
import { imageEditorPlugin } from './plugins/image-editor'

let mainWindow: BrowserWindow | null = null
let pluginHost: PluginHost | null = null
let tray: Tray | null = null
let isQuitting = false

// Embedded 32x32 tray icon (blue rounded square with white wrench).
// Embedded as base64 so the app works identically in dev and packaged mode
// without worrying about extra-resources paths.
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADkklEQVR42sWXW28TVxDHz/fIc2xCgskmJvElVb9HW5I+2AECBEg2NxPf2tcWSAtC4rEEVFXiBehDq1ItClKh7UOrVGqTrjRUIkGq12uv96I4XnuqOZvrssHxJqQj/aSzc+Y//9lz9mUZ24hY3mqL5y0xnrekeN6S43kLDhl5o7dIXmxnxHKmEMuZUixv2rG8ie8Ym3vlTIGbR7NmWzRnStGciUeMRN40gBjNmnY0a+IRQ54ii2QMKZIx8LCIZgx8/xOTE21eL7H+tCH3pw08KGQ2dNvCe8/W8YVsc+LZpjqZ9c8a0D9r4EGIpA3MfLOGr0sN3Iyl1fp+tMD6rurQd1XHgzB4y9oy/1dr4Pe/1/DOkyoOZI1mWmCnUjqcSunol76UjvML61vmnz9ewx//qHE+fbCGAxmnLjrr1Lr0wMIzOoRndPQLGTz/2+YDPPurhsuv61vX8GSxhnd+qPLroBqqdemBhacrEJ6uoF/iaR2fLzsDlM3tb2BzgO9+q/E11VCtSw+sd6oCvVMV9Et4qoLzC1V0x/JqHT97uMavheLu0yqvdemB9UxWoGeygn75+KbJzXYGncTCn7Ut81W1jh/OGV56YD0TGvRMaOiHoZvGG+buIPPUfQt7Jz17ABNEDQRRw1YZ+pLMbdex2zj/tIo/LdU4X0lV/OCGgb0Te/YB1j2uQfe4hq0w+IWBSy5zeqa8MK5hZNpBaN4LWPdYGbrHyrhfBucMXFpxma/YPN9Knw2AnbxShpNXyvg2hDGH03O6pznlm/XYA2Chy2UIXS6jF++lNMx+beG3v65zPM1v6LiXfh8AC10qQehSCd0MzJTx8S9VXLcRGw0Ht/lH13X00rYAsBOjJTgxWkI32fsmN18p1vFVsf6m+TUdvXQtAqzrYgm6LpZwJzQdvT299eI/u4+dcrRHNW6dD4B1XVCh64KKOwmNqtsDvNwe4JVS3x5gdLfGJ8A6z6vQeV5FN+l7zhWQ6eLLGofWlKM9L40PgB0fUeH4iIpuomIJH75wPsJ6w4HWlKM9L40PgHWcK0LHuSJ6ERFVnL1r4KOfqxxaU26veh8A6zhblDvOFvFtdI44NKvzgcyOnSlKx84U8X9CYsFhRQwOK3ZwWMEjhjxFGqAtmFSkYFLBI0Yib/5/GEgqQiCpSIGEYgcSCr5jbO6VVIRdf8iBRKGtPVEQ2xMFqT1RkNsTBThk5I3eInlt+v4HjWjD2EwIP5MAAAAASUVORK5CYII='

function getTrayIcon() {
  return nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_BASE64, 'base64'))
}

function createWindow(): BrowserWindow {
  const bounds = getWindowBounds()

  const window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    title: 'DevToolkit',
    icon: getTrayIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Intercept close: hide window instead of quitting
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const saveBounds = (): void => {
    if (window.isMinimized() || window.isMaximized()) return
    const { width, height, x, y } = window.getBounds()
    saveWindowBounds({ width, height, x, y })
  }
  window.on('resize', saveBounds)
  window.on('move', saveBounds)

  return window
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  // Bring to current desktop / focus
  mainWindow.focus()
  mainWindow.moveTop()
}

function createTray(): void {
  tray = new Tray(getTrayIcon())
  tray.setToolTip('DevToolkit')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open DevToolkit',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)

  // Single click (Windows) / double click toggles the window
  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
}

// Ensure only one instance runs — second launch brings the existing window forward
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId?.('com.devtoolkit.app')

    mainWindow = createWindow()
    createTray()

    const dbManager = new DatabaseManager(join(app.getPath('userData'), 'databases'))

    const sendToRenderer = (channel: string, ...args: unknown[]) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args)
      }
    }

    pluginHost = new PluginHost(sendToRenderer, dbManager)

    // Register all plugins
    pluginHost.register(sshTunnelPlugin)
    pluginHost.register(notebookPlugin)
    pluginHost.register(cryptoToolsPlugin)
    pluginHost.register(timeToolsPlugin)
    pluginHost.register(translationPlugin)
    pluginHost.register(imageEditorPlugin)

    // App-level IPC handlers (register before plugins so they're always available)
    ipcMain.handle('app:get-settings', () => ({
      activePluginId: getActivePluginId(),
      sidebarCollapsed: getSidebarCollapsed(),
      theme: getTheme()
    }))
    ipcMain.handle('app:save-active-plugin', (_e, id: string) => {
      saveActivePluginId(id)
    })
    ipcMain.handle('app:save-sidebar-collapsed', (_e, collapsed: boolean) => {
      saveSidebarCollapsed(collapsed)
    })
    ipcMain.handle('app:save-theme', (_e, theme: Theme) => {
      saveTheme(theme)
    })
    ipcMain.handle('app:quit', () => {
      isQuitting = true
      app.quit()
    })
    ipcMain.handle('app:hide-window', () => {
      mainWindow?.hide()
    })

    // Initialize all plugins (sets up IPC handlers, DB schemas, etc.)
    pluginHost.initializeAll().catch((err) => {
      console.error('Failed to initialize plugins:', err)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else {
        showMainWindow()
      }
    })
  })
}

// Don't quit on window-all-closed — the app keeps running in the tray.
// The only path to real quit is the tray menu "Quit" or app:quit IPC,
// both of which set isQuitting = true and call app.quit().
app.on('window-all-closed', () => {
  // intentionally left blank
})

app.on('before-quit', async () => {
  isQuitting = true
  if (pluginHost) {
    try {
      await pluginHost.disposeAll()
    } catch (err) {
      console.error('Error disposing plugins:', err)
    }
    pluginHost = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
})
