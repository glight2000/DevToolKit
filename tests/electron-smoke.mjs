import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { _electron } from 'playwright'

const userData = mkdtempSync(join(tmpdir(), 'devtoolkit-smoke-'))
writeFileSync(join(userData, 'config.json'), JSON.stringify({ activePluginId: 'image-editor', theme: 'dark' }))
mkdirSync('out/test-artifacts', { recursive: true })
const env = { ...process.env, DEVTOOLKIT_TEST_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({
  args: [resolve('tests/fixtures/electron-bootstrap.mjs')],
  env,
  timeout: 30_000
})
const errors = []
try {
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(() => typeof window.api?.invoke === 'function')
  await page.getByRole('button', { name: 'Notebook', exact: true }).waitFor()
  await page.waitForFunction(async () => (await window.api.invoke('app:get-settings')).activePluginId === 'ssh-tunnel')
  const buttons = await page.locator('nav button').allTextContents()
  assert.deepEqual(buttons, ['SSH Tunnel', 'SSH Connections', 'AI 订阅', 'Notebook', 'Crypto Tools', 'Time Tools', 'Translation', '桌面设置', '窗口速切', '快捷启动', '悬浮组件'])
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(2, 6, 23)')
  await page.screenshot({ path: 'out/test-artifacts/dark.png' })
  await page.getByRole('button', { name: 'Light Mode', exact: true }).click()
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)')
  await page.screenshot({ path: 'out/test-artifacts/light.png' })

  // Use deterministic config metadata, never the developer's real SSH files.
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('tunnel:discover-ssh-aliases')
    ipcMain.handle('tunnel:discover-ssh-aliases', (_event, distribution) => {
      const base = { configPath: 'C:/fixture/.ssh/config', hostname: 'server.example', username: 'deploy', port: 2222, keepAliveInterval: 45, keepAliveCountMax: 5, notes: [], problems: [] }
      return {
        sources: [{ id: 'local', label: 'Windows', state: 'ready' }, { id: 'wsl:Ubuntu', label: 'WSL · Ubuntu', state: distribution === 'Ubuntu' ? 'ready' : 'stopped' }],
        aliases: [
          { ...base, id: 'local-prod', alias: 'prod', sourceId: 'local', sourceLabel: 'Windows', identityFiles: ['C:/fixture/.ssh/key one'] },
          { ...base, id: 'blocked', alias: 'jump', sourceId: 'local', sourceLabel: 'Windows', identityFiles: [], problems: ['proxyjump cannot be reproduced by this connection engine.'] },
          ...(distribution === 'Ubuntu' ? [{ ...base, id: 'wsl-prod', alias: 'prod', sourceId: 'wsl:Ubuntu', sourceLabel: 'WSL · Ubuntu', identityFiles: ['\\\\wsl.localhost\\Ubuntu\\home\\deploy\\.ssh\\key'] }] : [])
        ]
      }
    })
  })

  await page.getByRole('button', { name: 'New Tunnel', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New Tunnel' })
  await dialog.waitFor()
  await page.getByLabel('SSH config alias', { exact: true }).selectOption('blocked')
  assert.equal(await page.getByRole('button', { name: 'Use alias', exact: true }).isDisabled(), true)
  await page.getByLabel('SSH config alias', { exact: true }).selectOption('local-prod')
  await page.getByRole('button', { name: 'Use alias', exact: true }).click()
  assert.equal(await page.getByPlaceholder('example.com', { exact: true }).inputValue(), 'server.example')
  assert.equal(await page.getByPlaceholder('root', { exact: true }).inputValue(), 'deploy')
  assert.equal(await page.getByLabel('Unanswered keep-alive limit', { exact: true }).inputValue(), '5')
  assert.equal(await page.getByPlaceholder('/home/user/.ssh/id_rsa', { exact: true }).inputValue(), 'C:/fixture/.ssh/key one')
  await page.getByRole('button', { name: 'Start and read', exact: true }).click()
  await page.getByLabel('SSH config alias', { exact: true }).selectOption('wsl-prod')
  await page.getByRole('button', { name: 'Use alias', exact: true }).click()
  assert.match(await page.getByPlaceholder('/home/user/.ssh/id_rsa', { exact: true }).inputValue(), /^\\\\wsl\.localhost\\Ubuntu/)
  await page.screenshot({ path: 'out/test-artifacts/ssh-alias-import.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Close dialog', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)))
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close dialog')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'New Tunnel')

  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await page.getByRole('button', { name: 'Crypto Tools', exact: true }).click()
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
  await page.getByRole('tab', { name: 'Password Generator', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await page.getByRole('tab', { name: 'Encoding', exact: true }).getAttribute('aria-selected'), 'true')
  const encodingInput = page.getByRole('tabpanel', { name: 'Encoding', exact: true }).locator('textarea').first()
  await encodingInput.fill('keep my input')
  await page.getByRole('tab', { name: 'Hash', exact: true }).click()
  await page.getByRole('tab', { name: 'Encoding', exact: true }).click()
  assert.equal(await encodingInput.inputValue(), 'keep my input')
  const modernWidth = await page.locator('aside').evaluate(el => el.getBoundingClientRect().width)
  await page.getByRole('button', { name: 'Compact', exact: true }).click()
  await page.waitForFunction(async () => (await window.api.invoke('app:get-settings')).interfaceMode === 'compact')
  assert.equal(await encodingInput.inputValue(), 'keep my input')
  await page.waitForFunction(width => document.querySelector('aside').getBoundingClientRect().width < width - 10, modernWidth)
  assert.equal(await page.getByRole('button', { name: 'Compact', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.reload()
  await page.waitForFunction(() => document.querySelector('[data-interface="compact"]'))
  assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)')
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await page.getByRole('button', { name: 'Switch to modern interface', exact: true }).click()
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
  await page.waitForFunction(async () => (await window.api.invoke('app:get-settings')).interfaceMode === 'modern')

  await page.getByRole('button', { name: 'Notebook', exact: true }).click()
  await page.getByTitle('New Document', { exact: true }).click()
  const editor = page.locator('main textarea')
  await editor.fill('saved before switching tools')
  const docs = await page.evaluate(() => window.api.invoke('notebook:get-tree'))
  const documentId = docs[0].id
  await page.getByRole('button', { name: 'Time Tools', exact: true }).click()
  await page.waitForFunction(async id => (await window.api.invoke('notebook:get-content', id)).content === 'saved before switching tools', documentId)

  await page.getByRole('button', { name: 'Notebook', exact: true }).click()
  await page.getByText('Untitled', { exact: true }).click()
  await editor.fill('#tag\n[bad](javascript:alert)\n# Heading\n**bold**')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await page.getByRole('heading', { name: 'Heading' }).waitFor()
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0)
  await page.screenshot({ path: 'out/test-artifacts/notebook.png' })

  await page.getByTitle('Encrypt document', { exact: true }).click()
  await page.getByPlaceholder('New password...').fill('smoke-test-password')
  await page.getByPlaceholder('Confirm password...').fill('smoke-test-password')
  await page.getByRole('button', { name: 'Encrypt', exact: true }).click()
  await page.getByTitle('Remove encryption', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await editor.fill('encrypted edit before navigation')
  await page.getByRole('button', { name: 'Time Tools', exact: true }).click()
  await page.getByRole('button', { name: 'Notebook', exact: true }).click()
  await page.getByText('Untitled', { exact: true }).click()
  await page.getByPlaceholder('Enter password...').fill('smoke-test-password')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('main textarea')?.value === 'encrypted edit before navigation')
  await page.getByTitle('Remove encryption', { exact: true }).click()
  await page.waitForFunction(async id => {
    const saved = await window.api.invoke('notebook:get-content', id)
    return !saved.isEncrypted && saved.content === 'encrypted edit before navigation'
  }, documentId)

  for (const name of ['Crypto Tools', 'Time Tools', 'Translation']) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.waitForFunction(() => document.querySelector('main')?.textContent.trim().length > 20)
  }
  await page.setViewportSize({ width: 900, height: 600 })
  await page.getByRole('heading', { name: 'Translation', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Copy', exact: true }).isDisabled(), true)
  for (const name of ['Translation', 'Time Tools', 'Crypto Tools', 'SSH Tunnel']) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.getByRole('heading', { name: name === 'SSH Tunnel' ? 'SSH Tunnel Manager' : name, exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-current'), 'page')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: horizontal overflow`)
    await page.screenshot({ path: `out/test-artifacts/${name.replaceAll(' ', '-').toLowerCase()}-compact.png`, animations: 'disabled' })
  }
  for (const mode of ['Modern', 'Compact']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    await page.waitForFunction(mode => document.querySelector(`[data-interface="${mode}"]`), mode.toLowerCase())
    for (const name of ['SSH Tunnel', 'Translation', 'Time Tools', 'Crypto Tools', 'Notebook']) {
      await page.getByRole('button', { name, exact: true }).click()
      if (name === 'Notebook') await page.getByRole('heading', { name: 'Notebook', exact: true }).waitFor()
      else await page.getByRole('heading', { name: name === 'SSH Tunnel' ? 'SSH Tunnel Manager' : name, exact: true }).waitFor()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}/${mode}: horizontal overflow`)
      await page.screenshot({ path: `out/test-artifacts/${name.replaceAll(' ', '-').toLowerCase()}-${mode.toLowerCase()}.png`, animations: 'disabled' })
    }
  }
  await page.getByRole('button', { name: 'Dark Mode', exact: true }).click()
  assert.ok(await page.locator('[data-interface="compact"]').count())
  await page.getByRole('button', { name: 'Translation', exact: true }).click()
  await page.getByRole('heading', { name: 'Translation', exact: true }).waitFor()
  await page.screenshot({ path: 'out/test-artifacts/translation-compact-dark.png', animations: 'disabled' })
  console.log(`Electron runtime: ${await app.evaluate(() => process.versions.electron)}`)
  assert.deepEqual(errors, [])
  console.log('PASS: Electron startup, IPC, five tools, themes, notebook autosave/encryption, SQLite, SSH alias import and blocked complex config, dialog focus, tab input retention, modern/compact styles, restored preferences, small windows')
  console.log(`Isolated test data: ${userData}`)
} finally {
  await app.close()
}
