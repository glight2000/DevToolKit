import { useMemo } from 'react'

interface MarkdownPreviewProps {
  content: string
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseInline(text: string): string {
  let result = escapeHtml(text)

  // Images: ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded" />')

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
  )

  // Bold + italic: ***text*** or ___text___
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  result = result.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>')

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')

  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '<del>$1</del>')

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code class="rounded bg-surface-700 px-1.5 py-0.5 text-sm font-mono text-pink-400">$1</code>')

  return result
}

function parseMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  const html: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code blocks: ```lang ... ```
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      const langLabel = lang
        ? `<div class="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">${escapeHtml(lang)}</div>`
        : ''
      html.push(
        `<div class="my-3 rounded-lg bg-surface-900 border border-surface-700 p-4 overflow-x-auto">${langLabel}<pre class="text-sm font-mono text-slate-300 leading-relaxed whitespace-pre">${escapeHtml(codeLines.join('\n'))}</pre></div>`
      )
      continue
    }

    // Horizontal rule: --- or *** or ___
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) {
      html.push('<hr class="my-6 border-surface-700" />')
      i++
      continue
    }

    // Headers: # to ######
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      const level = headerMatch[1].length
      const text = parseInline(headerMatch[2])
      const sizes: Record<number, string> = {
        1: 'text-2xl font-bold mt-6 mb-3 text-slate-100',
        2: 'text-xl font-bold mt-5 mb-2 text-slate-100',
        3: 'text-lg font-semibold mt-4 mb-2 text-slate-100',
        4: 'text-base font-semibold mt-3 mb-1 text-slate-200',
        5: 'text-sm font-semibold mt-2 mb-1 text-slate-300',
        6: 'text-sm font-medium mt-2 mb-1 text-slate-400'
      }
      html.push(`<h${level} class="${sizes[level]}">${text}</h${level}>`)
      i++
      continue
    }

    // Blockquotes: > text (can span multiple lines)
    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      html.push(
        `<blockquote class="my-3 border-l-2 border-blue-500/50 pl-4 text-slate-400 italic">${quoteLines.map(parseInline).join('<br />')}</blockquote>`
      )
      continue
    }

    // Unordered lists: - item or * item
    if (/^[\s]*[-*]\s+/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^[\s]*[-*]\s+/.test(lines[i])) {
        const itemMatch = lines[i].match(/^(\s*)[-*]\s+(.+)$/)
        if (itemMatch) {
          const indent = Math.floor(itemMatch[1].length / 2)
          const paddingClass = indent > 0 ? ` style="margin-left: ${indent * 1.25}rem"` : ''
          listItems.push(`<li${paddingClass} class="text-slate-300">${parseInline(itemMatch[2])}</li>`)
        }
        i++
      }
      html.push(`<ul class="my-2 list-disc pl-6 space-y-1">${listItems.join('')}</ul>`)
      continue
    }

    // Ordered lists: 1. item
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemMatch = lines[i].match(/^\s*\d+\.\s+(.+)$/)
        if (itemMatch) {
          listItems.push(`<li class="text-slate-300">${parseInline(itemMatch[1])}</li>`)
        }
        i++
      }
      html.push(`<ol class="my-2 list-decimal pl-6 space-y-1">${listItems.join('')}</ol>`)
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('>') &&
      !lines[i].startsWith('```') &&
      !/^[\s]*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\s*[-*_]){3,}\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      html.push(`<p class="my-2 leading-relaxed text-slate-300">${paraLines.map(parseInline).join('<br />')}</p>`)
    }
  }

  return html.join('\n')
}

export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const html = useMemo(() => parseMarkdown(content), [content])

  return (
    <div
      className="h-full overflow-y-auto px-8 py-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
