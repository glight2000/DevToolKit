import { useState, useCallback } from 'react'
import { Languages, ArrowLeftRight, Loader2, X } from 'lucide-react'
import CopyButton from '../../components/common/CopyButton'
import useTranslation from './hooks/useTranslation'

const LANGUAGES = [
  { code: 'zh-CN', label: 'Chinese' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'ru', label: 'Russian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' }
]

export default function TranslationPage() {
  const [sourceText, setSourceText] = useState('')
  const [sourceLang, setSourceLang] = useState('zh-CN')
  const [targetLang, setTargetLang] = useState('en')
  const [swapRotation, setSwapRotation] = useState(0)

  const { translatedText, loading, error, source } = useTranslation(
    sourceText,
    sourceLang,
    targetLang
  )

  const handleSwap = useCallback(() => {
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
    setSourceText(translatedText)
    setSwapRotation((r) => r + 180)
  }, [sourceLang, targetLang, translatedText])

  const handleClear = useCallback(() => {
    setSourceText('')
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-surface-800 bg-surface-900 px-6 pt-4 pb-4">
        <div className="flex items-center gap-2.5">
          <Languages className="h-5 w-5 text-blue-400" />
          <h1 className="text-lg font-bold text-slate-100">Translation</h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-400">Translate as you type. Compare the original and result side by side.</p>
      </div>

      {/* Language selector bar */}
      <div className="shrink-0 flex items-center justify-center gap-4 border-b border-surface-800 bg-surface-900/50 px-6 py-3">
        <select
          aria-label="Source language"
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm font-medium text-slate-100 outline-hidden focus:border-blue-500 transition-colors"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>

        <button
          aria-label="Swap languages"
          disabled={loading || (!!sourceText && !translatedText)}
          onClick={handleSwap}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-700 bg-surface-800 text-slate-400 transition-all duration-300 hover:border-blue-500 hover:text-blue-400 hover:bg-surface-700"
          title="Swap languages"
        >
          <ArrowLeftRight
            className="h-4 w-4 transition-transform duration-300"
            style={{ transform: `rotate(${swapRotation}deg)` }}
          />
        </button>

        <select
          aria-label="Target language"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm font-medium text-slate-100 outline-hidden focus:border-blue-500 transition-colors"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Text areas */}
      <div className="grid grid-cols-2 flex-1 min-h-0 gap-4 p-5 overflow-y-auto">
        {/* Source panel */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-800">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-surface-700 px-4">
            <span className="text-xs font-semibold text-slate-400">Original</span>
            {sourceText && <button onClick={handleClear} aria-label="Clear source text" title="Clear" className="rounded-md p-1.5 text-slate-400 hover:bg-surface-700"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="relative flex flex-1 min-h-0 flex-col">
            <textarea
              aria-label="Text to translate"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Enter text to translate..."
              className="w-full flex-1 min-h-[120px] resize-none bg-surface-800 p-4 text-sm leading-7 text-slate-100 placeholder-slate-500 outline-hidden"
              spellCheck={false}
            />
          </div>
          <div className="shrink-0 flex items-center border-t border-surface-800 bg-surface-900/50 px-4 py-2">
            <span className="text-xs text-slate-500">
              {sourceText.length} character{sourceText.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Target panel */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-surface-700 bg-surface-850" aria-busy={loading}>
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-surface-700 px-4">
            <span className="text-xs font-semibold text-slate-400">Translation</span>
            <span role="status" className="flex items-center gap-2 text-xs text-blue-400">{loading && <><Loader2 className="h-3.5 w-3.5 animate-spin" />Translating...</>}</span>
          </div>
          <div className="relative flex flex-1 min-h-0">
            <textarea
              aria-label="Translated text"
              value={translatedText}
              readOnly
              placeholder="Your translation will appear here"
              className="w-full flex-1 min-h-[120px] resize-none bg-surface-850 p-4 text-sm leading-7 text-slate-100 placeholder-slate-500 outline-hidden"
              spellCheck={false}
            />
          </div>
          <div className="shrink-0 flex items-center justify-between border-t border-surface-800 bg-surface-900/50 px-4 py-2">
            <div>
              {error && (
                <span role="alert" className="text-xs text-red-400">{error}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {source && !loading && translatedText && (
                <span className="text-xs text-slate-500">via {source}</span>
              )}
              <CopyButton text={loading ? '' : translatedText} label="Copy" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
