import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'

const userData = mkdtempSync(join(tmpdir(), 'devtoolkit-paragraphs-'))
writeFileSync(join(userData, 'config.json'), JSON.stringify({ activePluginId: 'notebook', theme: 'light' }))
const env = { ...process.env, DEVTOOLKIT_TEST_DATA: userData }; delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: [resolve('tests/fixtures/desktop-bootstrap.mjs')], env })
const errors = []
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(15000)
  page.on('pageerror', e => errors.push(e.message))
  await page.getByTitle('New Document', { exact: true }).click()
  const editor = page.locator('.paragraph-editor'), fields = editor.locator('textarea')
  await fields.first().fill('第一段内容')
  await fields.first().press('End')
  await fields.first().press('Enter')
  assert.equal(await fields.count(), 2)
  await fields.nth(1).fill('第二段')
  await fields.nth(1).press('End')
  await fields.nth(1).press('Shift+Enter')
  await page.keyboard.insertText('段内换行')
  assert.equal(await fields.nth(1).inputValue(), '第二段\n段内换行')
  await fields.nth(1).evaluate(el => el.setSelectionRange(0, 0))
  await fields.nth(1).press('Backspace')
  assert.equal(await fields.count(), 1)
  assert.equal(await fields.first().inputValue(), '第一段内容第二段\n段内换行')
  await fields.first().press('Control+z')
  assert.equal(await fields.count(), 2)
  await fields.nth(1).press('Control+y')
  assert.equal(await fields.count(), 1)
  await fields.first().press('Control+z')
  assert.equal(await fields.count(), 2)
  // Clipboard is stubbed in the renderer; do not touch the user's clipboard.
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedParagraph = text } } }))
  await editor.locator('.paragraph-block').first().hover()
  await editor.getByRole('button', { name: '复制段落 1', exact: true }).click()
  assert.equal(await page.evaluate(() => window.copiedParagraph), '第一段内容')
  const docId = (await page.evaluate(() => window.api.invoke('notebook:get-tree')))[0].id
  await page.getByRole('button', { name: 'Time Tools', exact: true }).click()
  await page.waitForFunction(async id => (await window.api.invoke('notebook:get-content', id)).content === '第一段内容\n\n第二段\n段内换行', docId)
  await page.getByRole('button', { name: 'Notebook', exact: true }).click()
  await page.getByText('Untitled', { exact: true }).click()
  await fields.nth(1).waitFor()
  assert.equal(await fields.nth(1).inputValue(), '第二段\n段内换行')
  // IME Enter must not split the paragraph while committing Chinese input.
  await fields.nth(1).dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
  assert.equal(await fields.count(), 2)
  await fields.nth(1).focus()
  await fields.nth(1).evaluate(el => el.setSelectionRange(el.value.length, el.value.length))
  await fields.nth(1).evaluate(el => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', '\n\n```js\nconst a = 1\n\nconsole.log(a)\n```\n\n最后一段')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
  })
  assert.equal(await fields.count(), 4)
  assert.equal(await fields.nth(2).inputValue(), '```js\nconst a = 1\n\nconsole.log(a)\n```')
  await editor.screenshot({ path: 'out/test-artifacts/paragraph-editor-light.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Dark Mode', exact: true }).click()
  await editor.screenshot({ path: 'out/test-artifacts/paragraph-editor-dark.png', animations: 'disabled' })
  await page.getByTitle('Lock document', { exact: true }).click()
  assert.equal(await page.locator('.paragraph-editor textarea').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: paragraph split/merge, Shift+Enter, undo/redo, copy, IME, multiline paste with fenced code, navigation persistence, themes and lock')
} finally { await app.close() }
