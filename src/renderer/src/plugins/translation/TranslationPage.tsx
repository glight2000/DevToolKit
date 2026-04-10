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
    setSourceLang((prev) => {
      setTargetLang(prev)
      return targetLang
    })
    setSourceText(translatedText)
    setSwapRotation((r) => r + 180)
  }, [targetLang, translatedText])

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
      </div>

      {/* Language selector bar */}
      <div className="shrink-0 flex items-center justify-center gap-4 border-b border-surface-800 bg-surface-900/50 px-6 py-3">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm font-medium text-slate-100 outline-none focus:border-blue-500 transition-colors"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>

        <button
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
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-sm font-medium text-slate-100 outline-none focus:border-blue-500 transition-colors"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Text areas */}
      <div className="flex flex-1 min-h-0">
        {/* Source panel */}
        <div className="flex flex-1 flex-col border-r border-surface-800">
          <div className="relative flex flex-1 flex-col">
            <textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Enter text to translate..."
              className="flex-1 min-h-[300px] resize-none bg-surface-800 p-4 text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none font-mono"
              spellCheck={false}
            />
            {sourceText && (
              <button
                onClick={handleClear}
                className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-surface-700 hover:text-slate-300"
                title="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="shrink-0 flex items-center border-t border-surface-800 bg-surface-900/50 px-4 py-2">
            <span className="text-xs text-slate-500">
              {sourceText.length} character{sourceText.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Target panel */}
        <div className="flex flex-1 flex-col">
          <div className="relative flex flex-1">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-850/80 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Translating...</span>
                </div>
              </div>
            )}
            <textarea
              value={translatedText}
              readOnly
              placeholder="Type something to translate..."
              className="flex-1 min-h-[300px] resize-none bg-surface-850 p-4 text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none font-mono"
              spellCheck={false}
            />
          </div>
          <div className="shrink-0 flex items-center justify-between border-t border-surface-800 bg-surface-900/50 px-4 py-2">
            <div>
              {error && (
                <span className="text-xs text-red-400">{error}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {source && !loading && translatedText && (
                <span className="text-xs text-slate-500">via {source}</span>
              )}
              {translatedText && (
                <CopyButton text={translatedText} label="Copy" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
