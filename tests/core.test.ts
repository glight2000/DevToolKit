import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { parseMarkdown } from '../src/renderer/src/plugins/notebook/components/MarkdownPreview'
import { PendingSave } from '../src/renderer/src/plugins/notebook/utils/pendingSave'
import { encryptWithPassword, decryptWithPassword } from '../src/renderer/src/plugins/notebook/utils/crypto'
import { encrypt, decrypt } from '../src/main/lib/crypto'
import { NotebookManager } from '../src/main/plugins/notebook/notebook-manager'
import { parseSSHCommand } from '../src/renderer/src/plugins/ssh-tunnel/utils/sshCommand'
import { powershellCommand, quoteShellArgument } from '../src/main/plugins/ssh-tunnel/terminal'
import { removePubKey } from '../src/main/plugins/ssh-tunnel/pubkey'

test('Markdown treats hash-prefixed ordinary text as a paragraph', { timeout: 2000 }, () => {
  assert.match(parseMarkdown('#tag\n####### text\n# Heading'), /#tag/)
  assert.match(parseMarkdown('#tag\n####### text\n# Heading'), /<h1[^>]*>Heading/)
  assert.match(parseMarkdown('paragraph\n  ```js\nconst x = 1\n  ```'), /<pre/)
})

test('Markdown escapes raw HTML and code', () => {
  assert.doesNotMatch(parseMarkdown('<script>alert(1)</script>'), /<script>/)
  assert.match(parseMarkdown('```html\n<img src=x>\n```'), /&lt;img/)
})

test('SQLite 13 preserves notebook content, metadata and cascading deletes', () => {
  const db = new Database(':memory:')
  try {
    const manager = new NotebookManager({ db, encrypt, decrypt, sendToRenderer() {} })
    const parent = manager.createDocument(null, '中文 notebook', 'original')
    const child = manager.createDocument(parent.id, 'child')
    manager.updateContent(child.id, 'saved content')
    manager.setLocked(child.id, true)
    assert.equal(manager.getContent(child.id)?.content, 'saved content')
    assert.equal(manager.getTree().find(doc => doc.id === child.id)?.isLocked, true)
    const row = db.prepare('SELECT title FROM documents WHERE id = ?').get(parent.id) as { title: string }
    assert.notEqual(row.title, parent.title)
    assert.equal(decrypt(row.title), parent.title)
    manager.deleteDocument(parent.id)
    assert.deepEqual(manager.getTree(), [])
  } finally {
    db.close()
  }
})

test('password-encrypted content round-trips and rejects a wrong password', async () => {
  const plaintext = '中文 notes 🔐\nsecond line'
  const ciphertext = await encryptWithPassword(plaintext, 'test password')
  assert.match(ciphertext, /^v1:/)
  assert.equal(await decryptWithPassword(ciphertext, 'test password'), plaintext)
  await assert.rejects(decryptWithPassword(ciphertext, 'wrong password'))
  await assert.rejects(decryptWithPassword('v1:zz:00:00', 'test password'), /hexadecimal/)
})

test('pending edits are flushed on navigation and coalesced to the latest value', async () => {
  const saves = new PendingSave()
  const written: string[] = []
  saves.schedule(async () => { written.push('old') })
  saves.schedule(async () => { written.push('latest') })
  await saves.flush()
  assert.deepEqual(written, ['latest'])
})

test('a slower prior save cannot overwrite a newer edit', async () => {
  const saves = new PendingSave()
  const written: string[] = []
  let release!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  saves.schedule(async () => { await blocked; written.push('old') })
  const first = saves.flush()
  saves.schedule(async () => { written.push('new') })
  const second = saves.flush()
  release()
  await Promise.all([first, second])
  assert.deepEqual(written, ['old', 'new'])
})

test('a failed save is reported and does not prevent subsequent saves', async () => {
  const saves = new PendingSave()
  saves.schedule(async () => { throw new Error('disk unavailable') })
  await assert.rejects(saves.flush(), /disk unavailable/)
  let recovered = false
  saves.schedule(async () => { recovered = true })
  await saves.flush()
  assert.equal(recovered, true)
})

test('SSH command import retains quoted key paths and tunnel settings', () => {
  const parsed = parseSSHCommand('ssh -L 8080:localhost:80 -p 2222 -i "C:/my keys/id_ed25519" user@example.com')
  assert.equal(parsed.privateKeyPath, 'C:/my keys/id_ed25519')
  assert.equal(parsed.sshPort, 2222)
  assert.equal(parsed.localPort, 8080)
  assert.equal(parsed.remotePort, 80)
  assert.equal(parsed.username, 'user')
})

test('terminal arguments preserve paths and quote shell metacharacters', () => {
  assert.equal(quoteShellArgument("a'b; echo injected"), "'a'\\''b; echo injected'")
  assert.equal(powershellCommand(['-i', "C:/my key's/id", '-l', 'user', '--', 'host;calc']),
    "& 'ssh' '-i' 'C:/my key''s/id' '-l' 'user' '--' 'host;calc'")
  assert.throws(() => quoteShellArgument('host\ncommand'), /single-line/)
})

test('public-key removal rejects shell syntax before opening a connection', async () => {
  const result = await removePubKey({} as never, "ssh-ed25519 AAAA';touch /tmp/injected")
  assert.equal(result.success, false)
  assert.match(result.error ?? '', /Invalid public key/)
})
