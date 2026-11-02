import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { resolve } from 'node:path'
if (!process.env.DEVTOOLKIT_TEST_DATA) throw new Error('Isolated profile required')
const spawn = childProcess.spawn
globalThis.subscriptionCommands = []
globalThis.subscriptionNowOffset = 0
const realNow = Date.now
Date.now = () => realNow() + globalThis.subscriptionNowOffset
const interval = globalThis.setInterval
globalThis.setInterval = (fn, milliseconds, ...args) => {
  if (milliseconds === 15000) globalThis.subscriptionPoll = () => fn(...args)
  return interval(fn, milliseconds, ...args)
}
childProcess.spawn = function (executable, args, options) {
  if (args?.some(arg => /^devtoolkit-fixture(-offline)?\.invalid$/.test(arg))) {
    globalThis.subscriptionCommands.push({ executable, args })
    return spawn(process.execPath, [resolve('tests/fixtures/subscription-ssh.mjs'), ...(args.includes('devtoolkit-fixture-offline.invalid') ? ['--offline'] : [])], { ...options, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  }
  return spawn(executable, args, options)
}
syncBuiltinESMExports()
await import('./desktop-bootstrap.mjs')
