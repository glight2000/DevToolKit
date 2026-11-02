import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { ConnectionStore, validateDraft } from '../src/main/plugins/ssh-connections/profiles'
import { aliasLaunch, profileLaunch, executableFor } from '../src/main/plugins/ssh-connections/launch'
import { ConfigFiles } from '../src/main/plugins/ssh-connections/config-files'
import { encrypt, decrypt } from '../src/main/lib/crypto'
import type { ConnectionDraft } from '../src/shared/ssh-connections'

const draft: ConnectionDraft = { name: 'Production', host: 'server.example', port: 2222, username: 'deploy', environment: 'local', auth: 'key', keyPath: 'C:/keys/key with spaces', group: 'Servers', tags: ['api', 'linux'], notes: 'Personal connection', favorite: false }

test('App profiles use encrypted independent storage with CRUD, favorites and launch history', () => {
  const db = new Database(':memory:')
  try {
    const store = new ConnectionStore({ db, encrypt, decrypt, sendToRenderer() {} })
    const saved = store.save(draft)
    assert.equal(store.list()[0].host, draft.host)
    assert.ok(!(db.prepare('SELECT payload FROM connections').get() as { payload: string }).payload.includes(draft.host))
    store.save({ ...saved, name: 'Renamed', favorite: true }, saved.id)
    store.markUsed(saved.id)
    assert.equal(store.get(saved.id).name, 'Renamed')
    assert.ok(store.get(saved.id).lastUsed)
    store.annotate('system:alias', true, true)
    assert.equal(store.metadata()['system:alias'].favorite, true)
    store.setLaunchMode('external')
    assert.equal(store.launchMode(), 'external')
    store.remove(saved.id)
    assert.equal(store.list().length, 0)
    assert.ok(store.metadata()['system:alias'])
  } finally { db.close() }
})

test('App profile launches isolate config; system aliases use native config without flattening', () => {
  const profile = profileLaunch(draft)
  assert.deepEqual(profile.args, ['-F', 'none', '-p', '2222', '-l', 'deploy', '-i', draft.keyPath, '-o', 'IdentitiesOnly=yes', '--', draft.host])
  assert.deepEqual(aliasLaunch('production', 'local').args, ['--', 'production'])
  const wsl = executableFor('wsl:Ubuntu Work', ['--', 'production'], 'Production', 'win32')
  assert.deepEqual(wsl.args, ['--distribution', 'Ubuntu Work', '--exec', 'ssh', '--', 'production'])
  assert.match(wsl.executable, /wsl\.exe$/)
  assert.throws(() => aliasLaunch('-oProxyCommand=evil', 'local'), /Invalid SSH alias/)
  assert.throws(() => validateDraft({ ...draft, host: 'x\ncommand' }), /Invalid host/)
  assert.throws(() => validateDraft({ ...draft, port: -1 }), /Port/)
  assert.throws(() => validateDraft({ ...draft, environment: 'wsl:../bad' }), /environment/)
  assert.throws(() => validateDraft({ ...draft, auth: 'key', keyPath: '' }), /key path/)
})

test('Config edits create backups, detect outside edits, refuse unknown paths and keep profile storage separate', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'devtoolkit-config-edit-'))
  try {
    const filename = path.join(directory, 'config')
    await writeFile(filename, '# retain comment\r\nHost prod\r\n  HostName old.example\r\n')
    const files = new ConfigFiles(path.join(directory, 'backups'))
    files.register('local', filename)
    const initial = await files.read('local')
    const next = initial.text.replace('old.example', 'new.example')
    const saved = await files.save('local', initial.revision, next)
    assert.equal(await readFile(saved.backup!, 'utf8'), initial.text)
    assert.equal(await readFile(filename, 'utf8'), next)
    assert.ok(saved.document.revision !== initial.revision)
    await assert.rejects(files.save('local', initial.revision, 'stale'), /changed outside/)
    assert.equal(await readFile(filename, 'utf8'), next)
    await assert.rejects(files.read('../../other'), /Refresh/)
    await assert.rejects(files.save('local', saved.document.revision, '\0'), /UTF-8/)
    files.register('wsl:fixture', path.join(directory, 'new', 'config'))
    const empty = await files.read('wsl:fixture')
    assert.equal(empty.exists, false)
    const created = await files.save('wsl:fixture', empty.revision, 'Host new\n HostName new.example\n')
    assert.equal(created.backup, null)
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('devtoolkit-config-edit-'))
    await rm(directory, { recursive: true, force: true })
  }
})
