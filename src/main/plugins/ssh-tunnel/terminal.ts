import { spawn } from 'node:child_process'

export function quoteShellArgument(value: string): string {
  if (/[\0\r\n]/.test(value)) throw new Error('SSH arguments must be single-line strings')
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function powershellCommand(args: string[]): string {
  for (const arg of args) quoteShellArgument(arg)
  return `& 'ssh' ${args.map(arg => `'${arg.replace(/'/g, "''")}'`).join(' ')}`
}

function launch(command: string, args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
}

export async function openCommandTerminal(executable: string, args: string[]): Promise<boolean> {
  for (const value of [executable, ...args]) quoteShellArgument(value)
  if (process.platform === 'win32') {
    const command = `& ${[executable, ...args].map(value => `'${value.replace(/'/g, "''")}'`).join(' ')}`
    return launch('powershell.exe', ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')])
  }
  const command = [executable, ...args].map(quoteShellArgument).join(' ')
  if (process.platform === 'darwin') {
    return launch('osascript', ['-e', `tell application "Terminal" to do script "${command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`])
  }
  for (const terminal of ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm']) {
    if (await launch(terminal, [terminal === 'gnome-terminal' ? '--' : '-e', 'bash', '-c', `${command}; exec bash`])) return true
  }
  return false
}

export async function openTerminal(args: string[]): Promise<boolean> {
  const command = ['ssh', ...args].map(quoteShellArgument).join(' ')
  if (process.platform === 'win32') {
    const encoded = Buffer.from(powershellCommand(args), 'utf16le').toString('base64')
    return launch('powershell.exe', ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', encoded])
  }
  if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script "${command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    return launch('osascript', ['-e', script])
  }
  for (const terminal of ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm']) {
    const separator = terminal === 'gnome-terminal' ? '--' : '-e'
    if (await launch(terminal, [separator, 'bash', '-c', `${command}; exec bash`])) return true
  }
  return false
}
