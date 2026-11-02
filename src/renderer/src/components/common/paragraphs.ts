export interface Paragraph { id: string; text: string; separator: string }
export const paragraph = (text = '', separator = ''): Paragraph => ({ id: crypto.randomUUID(), text, separator })
export const joinParagraphs = (blocks: Paragraph[]): string => blocks.map(block => block.text + block.separator).join('')

// Keep existing Markdown and whitespace byte-for-byte, including blank lines inside fences.
export function splitParagraphs(value: string): Paragraph[] {
  const fences: [number, number][] = []
  let fence: { marker: string; length: number; start: number } | undefined
  for (const match of value.matchAll(/^ {0,3}(`{3,}|~{3,})([^\n]*)/gm)) {
    const marker = match[1]
    if (!fence) fence = { marker: marker[0], length: marker.length, start: match.index }
    else if (marker[0] === fence.marker && marker.length >= fence.length && !match[2].trim()) {
      fences.push([fence.start, match.index + match[0].length]); fence = undefined
    }
  }
  if (fence) fences.push([fence.start, value.length])
  const blocks: Paragraph[] = []
  let start = 0, fenceIndex = 0
  for (const match of value.matchAll(/\r?\n(?:[\t ]*\r?\n)+/g)) {
    while (fences[fenceIndex] && fences[fenceIndex][1] < match.index) fenceIndex++
    const range = fences[fenceIndex]
    if (range && match.index >= range[0] && match.index < range[1]) continue
    blocks.push(paragraph(value.slice(start, match.index), match[0]))
    start = match.index + match[0].length
  }
  blocks.push(paragraph(value.slice(start)))
  return blocks
}
