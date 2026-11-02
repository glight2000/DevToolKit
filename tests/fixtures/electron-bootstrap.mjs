import { app, BrowserWindow } from 'electron'

if (!process.env.DEVTOOLKIT_TEST_DATA) throw new Error('An isolated test data directory is required')
app.setPath('userData', process.env.DEVTOOLKIT_TEST_DATA)
app.setName('DevToolkit Test')
// Exercise the real app without opening windows on the developer's desktop.
BrowserWindow.prototype.show = function () {}
await import('../../out/main/index.js')
