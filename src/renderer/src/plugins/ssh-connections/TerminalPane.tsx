import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export default function TerminalPane({ id, active }: { id: string; active: boolean }) {
  const element = useRef<HTMLDivElement>(null)
  const fitRef = useRef<() => void>(() => {})
  useEffect(() => {
    const terminal = new Terminal({ cursorBlink: true, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: 13,
      scrollback: 5000, convertEol: false, theme: { background: '#0b1020', foreground: '#dbe4f0', cursor: '#60a5fa', selectionBackground: '#3b82f650' } })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(element.current!)
    terminal.attachCustomKeyEventHandler(event => {
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyC') {
        const selection = terminal.getSelection()
        if (selection) navigator.clipboard.writeText(selection).catch(() => {})
        return false
      }
      return true
    })
    let alive = true, attached = false, sequence = 0
    const pending: { sequence: number; data: string }[] = []
    const write = (event: { sequence: number; data: string }) => {
      if (event.sequence > sequence) { sequence = event.sequence; terminal.write(event.data) }
    }
    const offData = window.api.on('ssh:terminal-data', (event: { id: string; sequence: number; data: string }) => {
      if (event.id !== id) return
      if (attached) write(event); else pending.push(event)
    })
    window.api.invoke('ssh:terminal-attach', id).then(snapshot => {
      if (!alive) return
      sequence = snapshot.sequence
      terminal.write(snapshot.buffer)
      attached = true
      pending.forEach(write); pending.length = 0
      fitRef.current()
    }).catch(error => { if (alive) terminal.writeln(`\r\n${String(error)}`) })
    const input = terminal.onData(data => { window.api.invoke('ssh:terminal-input', id, data).catch(() => {}) })
    const fitTerminal = () => {
      if (!element.current || element.current.clientWidth < 20 || element.current.clientHeight < 20) return
      fit.fit()
      window.api.invoke('ssh:terminal-resize', id, terminal.cols, terminal.rows).catch(() => {})
    }
    fitRef.current = () => { fitTerminal(); terminal.focus() }
    const observer = new ResizeObserver(fitTerminal)
    observer.observe(element.current!)
    return () => { alive = false; offData(); input.dispose(); observer.disconnect(); terminal.dispose() }
  }, [id])
  useEffect(() => { if (active) { const frame = requestAnimationFrame(() => fitRef.current()); return () => cancelAnimationFrame(frame) } }, [active])
  return <div ref={element} aria-label="SSH terminal" className="h-full min-h-0 w-full p-2 bg-[#0b1020]" />
}
