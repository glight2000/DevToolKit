import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { initSchema, saveTunnel, getAllTunnels } from '../src/main/plugins/ssh-tunnel/db-schema'
import type { TunnelConfig } from '../src/main/tunnel/types'
import { readAliases, configWords, type ConfigIO, type ConfigSource } from '../src/main/plugins/ssh-tunnel/ssh-config-parser'
import { discoverSshAliases, decodeWslList, wslPath, fileConfigIO, type DiscoveryEnvironment } from '../src/main/plugins/ssh-tunnel/ssh-config-discovery'

const source: ConfigSource = { id: 'test', label: 'Test', home: '/home/alice', username: 'alice', files: [{ path: '/home/alice/.ssh/config', includeBase: '/home/alice/.ssh' }] }
function fixture(files: Record<string, string>): ConfigIO {
  return {
    async read(file) { return files[file] ?? null },
    async expand(pattern, base) {
      const full = path.posix.resolve(base, pattern)
      return Object.keys(files).filter(file => path.posix.matchesGlob(file, full)).sort()
    },
    identityPath(value) { return value.replace(/^~\//, '/home/alice/') }
  }
}
async function parse(config: string, extra: Record<string, string> = {}) {
  return readAliases(source, fixture({ [source.files[0].path]: config, ...extra }))
}

test('SSH config handles case-insensitive keywords, equals, quotes, CRLF and first-value precedence', async () => {
  const aliases = await parse('Host prod stage\r\n  HostName = "server.example" # comment\r\n  USER deploy\r\n  Port=2222\r\nHost *\r\n User fallback\r\n Port 22\r\n IdentityFile "~/.ssh/key with spaces"')
  assert.deepEqual(aliases.map(alias => alias.alias), ['prod', 'stage'])
  assert.equal(aliases[0].username, 'deploy')
  assert.equal(aliases[0].port, 2222)
  assert.equal(aliases[0].hostname, 'server.example')
  assert.deepEqual(aliases[0].identityFiles, ['/home/alice/.ssh/key with spaces'])
  assert.deepEqual(aliases[0].problems, [])
  assert.deepEqual(configWords('"C:\\Users\\alice\\key file" # ignored'), ['C:\\Users\\alice\\key file'])
})

test('SSH Host negation and wildcard defaults are applied but never listed as aliases', async () => {
  const aliases = await parse('Host * !prod\n User other\nHost prod\n HostName prod.example\nHost stage\n HostName stage.example\nHost *\n User fallback')
  assert.equal(aliases.find(alias => alias.alias === 'prod')?.username, 'fallback')
  assert.equal(aliases.find(alias => alias.alias === 'stage')?.username, 'other')
  assert.equal(aliases.length, 2)
})

test('Include ordering, source-relative paths and enclosing Host scope match OpenSSH', async () => {
  const aliases = await parse('Include hosts/*.conf\nHost prod\n Include options/*.conf\n Port 2200\nHost other\n HostName other.example\nHost *\n User fallback', {
    '/home/alice/.ssh/hosts/a.conf': 'Host prod\n HostName prod.example',
    '/home/alice/.ssh/options/a.conf': 'Port 2222\nHost unrelated\n User should-not-leak',
    '/home/alice/.ssh/options/b.conf': 'User deploy'
  })
  assert.equal(aliases.length, 2)
  assert.equal(aliases[0].alias, 'other')
  assert.equal(aliases[0].port, 22)
  assert.equal(aliases[1].port, 2222)
  assert.equal(aliases[1].username, 'deploy')
})

test('Cycles, unreadable configs and malformed quotes fail explicitly', async () => {
  await assert.rejects(parse('Include config'), /cycle/)
  await assert.rejects(parse('Host "broken'), /Unclosed quote/)
  await assert.rejects(readAliases(source, { ...fixture({}), read: async () => { throw new Error('EACCES') } }), /EACCES/)
})

test('ProxyJump, Match exec and unknown options cannot silently downgrade to direct connections', async () => {
  for (const directive of ['ProxyJump bastion', 'ProxyCommand ssh jump -W %h:%p', 'Match exec "touch SHOULD_NOT_RUN"\n User changed', 'UnknownOption yes']) {
    const [alias] = await parse(`Host prod\n HostName prod.example\n ${directive}`)
    assert.ok(alias.problems.length > 0, directive)
  }
  const [alias] = await parse('Host prod\n ProxyJump none\n CanonicalizeHostname no')
  assert.deepEqual(alias.problems, [])
})

test('IdentityFile is additive and expands supported tokens without reading key contents', async () => {
  const [alias] = await parse('Host prod\n HostName host.example\n User deploy\n IdentityFile "%d/.ssh/%h-%r-%p"\n IdentityFile ~/.ssh/second\nHost *\n IdentityFile ~/.ssh/second')
  assert.deepEqual(alias.identityFiles, ['/home/alice/.ssh/host.example-deploy-22', '/home/alice/.ssh/second'])
  assert.ok(alias.notes.some(note => note.includes('Multiple identities')))
  const [invalid] = await parse('Host prod\n IdentityFile ~/.ssh/%Z\n Port 70000')
  assert.equal(invalid.problems.length, 2)
})

test('WSL Unicode list decoding and Linux-to-UNC path conversion', () => {
  assert.deepEqual(decodeWslList(Buffer.from('\uFEFFUbuntu\r\n开发 环境\r\n', 'utf16le')), ['Ubuntu', '开发 环境'])
  assert.equal(wslPath('Ubuntu', '/home/alice/.ssh/../key'), '\\\\wsl.localhost\\Ubuntu\\home\\alice\\key')
  assert.throws(() => wslPath('../Ubuntu', '/home/a'), /Invalid WSL/)
  assert.throws(() => wslPath('Ubuntu', 'relative/key'), /absolute Linux paths/)
  assert.equal(fileConfigIO('/home/alice', 'Ubuntu').identityPath('~/.ssh/id_ed25519'), '\\\\wsl.localhost\\Ubuntu\\home\\alice\\.ssh\\id_ed25519')
})

test('Discovery isolates equal aliases by source and never starts stopped WSL unless selected', async () => {
  const calls: string[][] = []
  const env: DiscoveryEnvironment = {
    platform: 'win32', home: 'C:/Users/alice', username: 'alice', systemConfig: 'C:/ProgramData/ssh/ssh_config',
    async runWsl(args) {
      calls.push(args)
      if (args[0] === '--list') return Buffer.from(args.includes('--running') ? 'Ubuntu\r\n' : 'Ubuntu\r\nDebian\r\n', 'utf16le')
      return Buffer.from(args.at(-1) === 'HOME' ? '/home/alice\n' : 'alice\n')
    },
    io(home, distro) {
      const filename = distro ? path.posix.join(home, '.ssh/config') : path.join(home, '.ssh/config')
      return fixture({ [filename]: 'Host prod\n HostName prod.example' })
    }
  }
  const first = await discoverSshAliases(undefined, env)
  assert.equal(first.aliases.length, 2)
  assert.equal(new Set(first.aliases.map(alias => alias.id)).size, 2)
  assert.equal(first.sources.find(item => item.id === 'wsl:Debian')?.state, 'stopped')
  assert.equal(first.sources.find(item => item.id === 'local')?.configExists, true)
  assert.ok(!calls.some(args => args.includes('Debian')))
  const second = await discoverSshAliases('Debian', env)
  assert.equal(second.aliases.length, 3)
  assert.ok(calls.some(args => args.includes('Debian')))
  calls.length = 0
  const invalid = await discoverSshAliases('Not installed', env)
  assert.ok(invalid.sources.some(item => item.state === 'error'))
  assert.ok(!calls.some(args => args.includes('--distribution')))
})

test('Missing WSL does not prevent native aliases from being discovered', async () => {
  const env: DiscoveryEnvironment = {
    platform: 'win32', home: 'C:/Users/alice', username: 'alice', systemConfig: 'C:/ssh_config',
    async runWsl() { throw new Error('WSL unavailable') },
    io(home) { return fixture({ [path.join(home, '.ssh/config')]: 'Host prod\n HostName example.com' }) }
  }
  const result = await discoverSshAliases(undefined, env)
  assert.equal(result.aliases.length, 1)
  assert.equal(result.sources.find(item => item.id === 'wsl')?.state, 'error')
})
test('Missing user config is reported separately from an empty existing config', async () => {
  const env: DiscoveryEnvironment = {
    platform: 'linux', home: '/home/test', username: 'test', systemConfig: '/etc/ssh/ssh_config',
    async runWsl() { throw new Error('not expected') },
    io() { return fixture({}) }
  }
  const missing = await discoverSshAliases(undefined, env)
  assert.equal(missing.sources[0].configExists, false)
  assert.equal(missing.sources[0].state, 'ready')
  env.io = () => fixture({ [path.join(env.home, '.ssh/config')]: '# empty config' })
  assert.equal((await discoverSshAliases(undefined, env)).sources[0].configExists, true)
})

test('Keepalive settings survive storage and existing databases migrate without losing tunnels', async () => {
  const [alias] = await parse('Host prod\n ServerAliveInterval 45\n ServerAliveCountMax 5\n GSSAPIAuthentication yes')
  assert.equal(alias.keepAliveCountMax, 5)
  assert.deepEqual(alias.problems, [])
  assert.ok(alias.notes.some(note => note.includes('Kerberos-only')))
  const [restricted] = await parse('Host prod\n PreferredAuthentications gssapi-with-mic')
  assert.ok(restricted.problems.length > 0)
  const db = new Database(':memory:')
  try {
    initSchema(db)
    const config: TunnelConfig = { id: 'test', name: 'prod', remarks: '', type: 'local', sshHost: alias.hostname, sshPort: alias.port,
      username: alias.username, authType: 'password', localHost: 'localhost', localPort: 1234, remoteHost: 'localhost', remotePort: 3306,
      autoStart: false, autoReconnect: true, keepAliveInterval: alias.keepAliveInterval, keepAliveCountMax: alias.keepAliveCountMax, createdAt: 1, updatedAt: 1 }
    saveTunnel(db, config, value => value)
    assert.equal(getAllTunnels(db, value => value)[0].keepAliveCountMax, 5)
    db.exec('ALTER TABLE tunnels DROP COLUMN keep_alive_count_max')
    initSchema(db)
    initSchema(db)
    const restored = getAllTunnels(db, value => value)[0]
    assert.equal(restored.keepAliveCountMax, 3)
    assert.equal(restored.keepAliveInterval, 45)
    assert.equal(restored.name, 'prod')
  } finally { db.close() }
})

test('Real filesystem includes use lexical order and never read private keys', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'devtoolkit-config-test-'))
  try {
    const base = path.join(directory, '.ssh')
    await mkdir(path.join(base, 'conf.d'), { recursive: true })
    await writeFile(path.join(base, 'config'), 'Include conf.d/*.conf\nHost *\n Port 22')
    await writeFile(path.join(base, 'conf.d', '01.conf'), 'Host prod\n Port 2222\n IdentityFile ~/.ssh/nonexistent-key')
    await writeFile(path.join(base, 'conf.d', '02.conf'), 'Host prod\n Port 3333')
    const aliases = await readAliases({ ...source, home: directory, files: [{ path: path.join(base, 'config'), includeBase: base }] }, fileConfigIO(directory))
    assert.equal(aliases[0].port, 2222)
    assert.deepEqual(aliases[0].identityFiles, [path.join(base, 'nonexistent-key')])
    assert.deepEqual(aliases[0].problems, [])
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('devtoolkit-config-test-'))
    await rm(directory, { recursive: true, force: true })
  }
})
