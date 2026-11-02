import type { SshAlias } from '../../../shared/ssh-config'

interface Directive { key: string; args: string[]; location: string; children?: Directive[][] }
export interface ConfigIO {
  read(path: string): Promise<string | null>
  expand(pattern: string, base: string): Promise<string[]>
  identityPath(path: string): string
}
export interface ConfigSource {
  id: string; label: string; home: string; username: string
  files: { path: string; includeBase: string }[]
}

// Preserve Windows backslashes; only unescape quotes, whitespace and backslashes.
export function configWords(line: string): string[] {
  const words: string[] = []
  let word = '', quoted = false, started = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '\\' && /[\\"\s]/.test(line[i + 1] ?? '')) {
      word += line[++i]; started = true
    } else if (c === '"') { quoted = !quoted; started = true }
    else if (!quoted && c === '#') break
    else if (!quoted && /\s/.test(c)) {
      if (started) { words.push(word); word = ''; started = false }
    } else { word += c; started = true }
  }
  if (quoted) throw new Error('Unclosed quote')
  if (started) words.push(word)
  return words
}

function patternMatches(value: string, pattern: string): boolean {
  value = value.toLowerCase(); pattern = pattern.toLowerCase()
  let cursor = 0, position = 0, star = -1, retry = 0
  while (cursor < value.length) {
    if (pattern[position] === '?' || pattern[position] === value[cursor]) { cursor++; position++ }
    else if (pattern[position] === '*') { star = position++; retry = cursor }
    else if (star >= 0) { position = star + 1; cursor = ++retry }
    else return false
  }
  while (pattern[position] === '*') position++
  return position === pattern.length
}

export function matchesHost(host: string, patterns: string[]): boolean {
  let positive = false
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (patternMatches(host, pattern.slice(1))) return false
    } else if (patternMatches(host, pattern)) positive = true
  }
  return positive
}

export async function readAliases(source: ConfigSource, io: ConfigIO): Promise<SshAlias[]> {
  const candidates = new Map<string, string>()
  let fileCount = 0, bytes = 0
  const load = async (path: string, base: string, chain: string[]): Promise<Directive[]> => {
    if (chain.includes(path)) throw new Error(`Include cycle: ${path}`)
    if (chain.length >= 16 || ++fileCount > 128) throw new Error('SSH config include limit exceeded')
    const content = await io.read(path)
    if (content === null) return []
    bytes += Buffer.byteLength(content)
    if (bytes > 4 * 1024 * 1024) throw new Error('SSH configs exceed 4 MB')
    const nodes: Directive[] = []
    for (const [index, line] of content.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
      const location = `${path}:${index + 1}`
      if (line.length > 16384) throw new Error(`${location}: config line exceeds 16 KB`)
      // The optional '=' belongs only to the keyword separator, not its value.
      const match = line.match(/^\s*([^\s=#]+)(?:\s*=\s*|\s+)?(.*)$/)
      if (!match) continue
      const key = match[1].toLowerCase()
      let args: string[]
      try { args = configWords(match[2]) } catch (error) { throw new Error(`${location}: ${(error as Error).message}`) }
      if (!args.length) throw new Error(`${location}: missing ${key} value`)
      const node: Directive = { key, args, location }
      if (key === 'host') {
        for (const name of args) {
          if (!/[!*?\s]/.test(name) && !name.startsWith('-')) candidates.set(name.toLowerCase(), name)
        }
        if (candidates.size > 1000) throw new Error('Too many SSH aliases (limit 1000)')
      }
      if (key === 'include') {
        node.children = []
        for (const pattern of args) {
          if (/%|\$\{|^~[^/\\]/.test(pattern)) {
            throw new Error(`${location}: dynamic Include paths require OpenSSH`)
          }
          for (const file of await io.expand(pattern, base)) node.children.push(await load(file, base, [...chain, path]))
        }
      }
      nodes.push(node)
    }
    return nodes
  }
  const roots: Directive[][] = []
  for (const file of source.files) roots.push(await load(file.path, file.includeBase, []))
  const result: SshAlias[] = []
  for (const alias of candidates.values()) {
    const values = new Map<string, string[]>()
    const keys: string[] = [], problems = new Set<string>(), notes = new Set<string>()
    let declared = false
    const visit = (nodes: Directive[], initial: boolean | null = true) => {
      let active = initial
      for (const node of nodes) {
        if (node.key === 'host') {
          active = matchesHost(alias, node.args)
          if (active && node.args.some(name => name.toLowerCase() === alias.toLowerCase())) declared = true
          continue
        }
        if (node.key === 'match') {
          // No Match exec is ever executed during discovery. Conditional passes
          // can change the resolved identity, so they cannot be silently flattened.
          active = node.args.length === 1 && node.args[0].toLowerCase() === 'all' ? true : null
          if (active === null) problems.add('Conditional Match rules require OpenSSH; this alias cannot be imported reliably.')
          continue
        }
        if (active === false) continue
        if (node.key === 'include') {
          if (active === true) for (const child of node.children ?? []) visit(child)
          continue
        }
        if (active === null) continue
        if (node.key === 'identityfile') {
          if (node.args.length !== 1) problems.add(`Invalid IdentityFile at ${node.location}`)
          else if (!keys.includes(node.args[0])) keys.push(node.args[0])
        } else if (!values.has(node.key)) values.set(node.key, node.args)
      }
    }
    roots.forEach(root => visit(root))
    if (!declared) continue
    const single = (key: string, fallback: string): string => {
      const args = values.get(key)
      if (args && args.length !== 1) problems.add(`${key} must have one value`)
      return args?.[0] ?? fallback
    }
    const hostname = single('hostname', alias).replace(/%%|%h/g, token => token === '%%' ? '%' : alias)
    const username = single('user', source.username)
    const port = Number(single('port', '22'))
    const keepAliveInterval = Number(single('serveraliveinterval', '30'))
    const keepAliveCountMax = Number(single('serveralivecountmax', '3'))
    if (!hostname || /[%\s\x00-\x1f]/.test(hostname) || hostname.startsWith('-')) problems.add('HostName contains unsupported tokens or characters')
    if (!username || /[%\s\x00-\x1f]/.test(username)) problems.add('User is missing or contains unsupported tokens')
    if (!Number.isInteger(port) || port < 1 || port > 65535) problems.add('Port must be between 1 and 65535')
    if (!Number.isInteger(keepAliveInterval) || keepAliveInterval < 0 || keepAliveInterval > 300) problems.add('ServerAliveInterval must be between 0 and 300 seconds')
    if (!Number.isInteger(keepAliveCountMax) || keepAliveCountMax < 0 || keepAliveCountMax > 1000) problems.add('ServerAliveCountMax must be between 0 and 1000')
    const supported = new Set(['hostname', 'user', 'port', 'serveraliveinterval', 'serveralivecountmax', 'identitiesonly'])
    const informational = new Set(['localforward', 'remoteforward', 'dynamicforward', 'forwardagent', 'forwardx11', 'forwardx11trusted', 'requesttty', 'sessiontype', 'sendenv', 'setenv', 'loglevel', 'hashknownhosts', 'addkeystoagent', 'controlmaster', 'controlpath', 'controlpersist', 'tcpkeepalive', 'compression'])
    for (const [key, args] of values) {
      if (supported.has(key)) continue
      if (informational.has(key)) notes.add(`${key} is not imported; only connection fields are copied.`)
      else if (key === 'gssapiauthentication' && ['no', 'false'].includes(args[0].toLowerCase())) continue
      else if (key === 'gssapiauthentication' && ['yes', 'true'].includes(args[0].toLowerCase())) notes.add('GSSAPI/Kerberos is enabled in the source but is not available here. Choose a private key or password; Kerberos-only servers cannot connect.')
      else if (['proxyjump', 'proxycommand', 'identityagent', 'certificatefile'].includes(key) && args.join(' ').toLowerCase() === 'none') continue
      else if (key === 'canonicalizehostname' && ['no', 'false'].includes(args[0].toLowerCase())) continue
      else problems.add(`${key} cannot be reproduced by this connection engine.`)
    }
    const tokens: Record<string, string> = { '%': '%', d: source.home, h: hostname, n: alias, p: String(port), r: username, u: source.username }
    const identityFiles: string[] = []
    for (const key of keys.filter(value => value.toLowerCase() !== 'none')) {
      let valid = true
      const expanded = key.replace(/%(.?)/g, (_, token: string) => {
        if (!(token in tokens)) { valid = false; return '' }
        return tokens[token]
      })
      if (!valid || /\$\{|^~[^/\\]/.test(expanded)) { problems.add('IdentityFile contains unsupported expansion'); continue }
      try { identityFiles.push(io.identityPath(expanded)) }
      catch (error) { problems.add((error as Error).message) }
    }
    if (identityFiles.length > 1) notes.add('Multiple identities: choose the key to use. Keys are not tried automatically.')
    if (!identityFiles.length) notes.add('No explicit IdentityFile. Select a key or enter a password; SSH agent and default key discovery are not imported.')
    notes.add('Imports a snapshot of connection fields, not a live OpenSSH profile. The original config is unchanged.')
    result.push({ id: JSON.stringify([source.id, alias.toLowerCase()]), alias, sourceId: source.id, sourceLabel: source.label,
      configPath: source.files[0].path, hostname, username, port, keepAliveInterval, keepAliveCountMax, identityFiles,
      problems: [...problems], notes: [...notes] })
  }
  return result.sort((a, b) => a.alias.localeCompare(b.alias))
}
