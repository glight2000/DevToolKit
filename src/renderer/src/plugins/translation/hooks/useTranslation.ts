import { useState, useEffect, useRef } from 'react'

interface TranslationResult {
  translatedText: string
  loading: boolean
  error: string | null
  source: string | null
}

export default function useTranslation(
  sourceText: string,
  sourceLang: string,
  targetLang: string
): TranslationResult {
  const [translatedText, setTranslatedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const abortRef = useRef(0)

  useEffect(() => {
    const trimmed = sourceText.trim()

    if (!trimmed) {
      setTranslatedText('')
      setError(null)
      setSource(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const requestId = ++abortRef.current

    const timer = setTimeout(async () => {
      try {
        const result = await window.api.invoke(
          'translation:translate',
          trimmed,
          sourceLang,
          targetLang
        )

        // Ignore stale responses
        if (requestId !== abortRef.current) return

        if (result.success) {
          setTranslatedText(result.text)
          setSource(result.source)
          setError(null)
        } else {
          setTranslatedText('')
          setError(result.error || 'Translation failed')
          setSource(null)
        }
      } catch (err) {
        if (requestId !== abortRef.current) return
        setTranslatedText('')
        setError(err instanceof Error ? err.message : 'Translation error')
        setSource(null)
      } finally {
        if (requestId === abortRef.current) {
          setLoading(false)
        }
      }
    }, 500)

    return () => {
      clearTimeout(timer)
    }
  }, [sourceText, sourceLang, targetLang])

  return { translatedText, loading, error, source }
}
