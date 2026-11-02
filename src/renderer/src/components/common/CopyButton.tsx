import { useState, useRef, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  text: string
  className?: string
  label?: string
}

export default function CopyButton({ text, className = '', label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const handleCopy = async () => {
    clearTimeout(timer.current)
    setFailed(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
      setFailed(true)
    }
    timer.current = setTimeout(() => { setCopied(false); setFailed(false) }, 2000)
  }

  return (
    <button
      type="button"
      disabled={!text}
      aria-label={copied ? 'Copied' : failed ? 'Copy failed. Try again' : label || 'Copy to clipboard'}
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
        copied
          ? 'text-emerald-400 bg-emerald-500/10'
          : 'text-slate-400 hover:text-slate-200 hover:bg-surface-700'
      } disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      title={copied ? 'Copied!' : failed ? 'Copy failed. Try again' : 'Copy to clipboard'}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {(label || failed) && <span>{failed ? 'Try again' : copied ? 'Copied' : label}</span>}
      <span className="sr-only" role="status">{copied ? 'Copied to clipboard' : failed ? 'Unable to copy. Try again.' : ''}</span>
    </button>
  )
}
