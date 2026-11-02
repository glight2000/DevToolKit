import { useEffect, useRef } from 'react'

export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    if (!dialog) return
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'
    )).filter(el => el.getClientRects().length > 0)
    const frame = requestAnimationFrame(() => {
      if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus()
    })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0]
      const last = items.at(-1)
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    dialog.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(frame)
      dialog.removeEventListener('keydown', handleKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  return ref
}
