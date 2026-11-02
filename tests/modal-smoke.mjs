import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from 'playwright'

const userData = mkdtempSync(join(tmpdir(), 'devtoolkit-modal-'))
writeFileSync(join(userData, 'config.json'), JSON.stringify({ activePluginId: 'ssh-tunnel' }))
const env = { ...process.env, DEVTOOLKIT_TEST_DATA: userData }
delete env.ELECTRON_RUN_AS_NODE
const app = await _electron.launch({ args: [resolve('tests/fixtures/electron-bootstrap.mjs')], env, timeout: 30000 })
try {
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  const prompts = []
  page.on('dialog', async dialog => { prompts.push(dialog.message()); await dialog.dismiss() })
  await page.getByRole('button', { name: 'New Tunnel', exact: true }).waitFor()
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('tunnel:discover-ssh-aliases')
    ipcMain.handle('tunnel:discover-ssh-aliases', () => ({ aliases: [], sources: [] }))
    ipcMain.removeHandler('ssh:catalog')
    ipcMain.handle('ssh:catalog', () => ({ aliases: [], sources: [{ id: 'local', label: 'Windows', state: 'ready' }], profiles: [], metadata: {}, preferences: { launchMode: 'embedded' } }))
  })
  const staysOpen = async (dialog, input) => {
    await dialog.waitFor()
    if (input) await input.fill('draft-must-survive')
    // Release outside after starting a drag inside, then click the backdrop.
    const box = await dialog.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + 25)
    await page.mouse.down()
    await page.mouse.move(4, 4, { steps: 5 })
    await page.mouse.up()
    await page.mouse.click(4, 4)
    assert.equal(await dialog.isVisible(), true)
    if (input) assert.equal(await input.inputValue(), 'draft-must-survive')
    assert.deepEqual(prompts, [], 'Backdrop interaction must not request discarding a draft')
  }
  await page.getByRole('button', { name: 'New Tunnel', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'New Tunnel', exact: true })
  await staysOpen(dialog, page.getByPlaceholder('example.com', { exact: true }))
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })

  await page.getByRole('button', { name: 'Import', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Import from Command', exact: true })
  await staysOpen(dialog, dialog.locator('textarea'))
  await dialog.locator('textarea').press('Escape')
  await dialog.waitFor({ state: 'detached' })

  await page.evaluate(() => window.api.invoke('tunnel:create', { name: 'Modal fixture', sshHost: 'fixture.invalid', autoStart: false }))
  await page.reload()
  await page.getByTitle('Delete tunnel', { exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Delete tunnel', exact: true })
  await staysOpen(dialog)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })

  await page.getByRole('button', { name: 'SSH Connections', exact: true }).click()
  await page.getByRole('button', { name: 'New connection', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Connection details', exact: true })
  const name = page.getByLabel('Connection name', { exact: true })
  await staysOpen(dialog, name)
  await name.press('Escape')
  assert.deepEqual(prompts, ['Discard unsaved connection changes?'])
  assert.equal(await dialog.isVisible(), true)
  await name.fill('')
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  console.log('PASS: four modal implementations retain drafts after outside release/click; close, cancel, Escape and dirty-draft protection work')
} finally {
  await app.close()
}
