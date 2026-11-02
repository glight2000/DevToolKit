import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitParagraphs, joinParagraphs } from '../src/renderer/src/components/common/paragraphs'

test('existing whitespace, Markdown and fenced code round trip without rewriting', () => {
  for (const source of ['', '\n\n', '第一段\n换行\n\n第二段\n', '# Title\r\n\r\n A \r\n \t\r\n\r\nB', '```js\nconst a = 1\n\nconsole.log(a)\n```\n\nAfter', '~~~\ncode\n\nmore\n~~~\n\nAfter', '````\n```\n\ncode\n````\n\nEnd', '```unfinished\n\nkeep this together']) {
    assert.equal(joinParagraphs(splitParagraphs(source)), source)
  }
  assert.equal(splitParagraphs('```js\na\n\nb\n```\n\nAfter').length, 2)
  assert.equal(splitParagraphs('```unfinished\n\na\n\nb').length, 1)
})
