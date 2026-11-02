import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, stat, realpath, mkdir, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import type { ConfigDocument } from '../../../shared/ssh-connections'

export class ConfigFiles {
  private paths = new Map<string, string>()
  private saving = new Set<string>()
  constructor(private backupDirectory: string) {}
  register(sourceId: string, filename: string): void { this.paths.set(sourceId, path.resolve(filename)) }
  private filename(sourceId: string): string {
    const filename = this.paths.get(sourceId)
    if (!filename) throw new Error('Refresh or start this source before editing its config')
    return filename
  }
  async read(sourceId: string): Promise<ConfigDocument> {
    const filename = this.filename(sourceId)
    let text = '', exists = false, resolved = filename
    try {
      resolved = await realpath(filename)
      const info = await stat(resolved)
      if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Config must be a text file smaller than 1 MB')
      text = await readFile(resolved, { encoding: 'utf8', signal: AbortSignal.timeout(5000) }); exists = true
      if (text.includes('\0')) throw new Error('Use UTF-8 encoding for this SSH config')
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    return { sourceId, path: filename, text, exists, revision: createHash('sha256').update(`${resolved}\0${exists}\0${text}`).digest('hex') }
  }
  async save(sourceId: string, revision: string, text: string): Promise<{ document: ConfigDocument; backup: string | null }> {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 1024 * 1024 || text.includes('\0')) throw new Error('Config must be UTF-8 text smaller than 1 MB')
    const registered = this.filename(sourceId)
    if (this.saving.has(registered)) throw new Error('A save is already in progress')
    this.saving.add(registered)
    let temporary: string | undefined
    try {
      const current = await this.read(sourceId)
      if (current.revision !== revision) throw new Error('Config changed outside DevToolkit. Reload it before saving; your draft has been kept.')
      const target = current.exists ? await realpath(registered) : registered
      const mode = current.exists ? (await stat(target)).mode & 0o777 : 0o600
      let backup: string | null = null
      if (current.exists) {
        await mkdir(this.backupDirectory, { recursive: true, mode: 0o700 })
        backup = path.join(this.backupDirectory, `${Date.now()}-${randomUUID()}.conf`)
        await writeFile(backup, current.text, { flag: 'wx', mode: 0o600 })
      }
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      temporary = path.join(path.dirname(target), `.devtoolkit-${randomUUID()}.tmp`)
      await writeFile(temporary, text, { flag: 'wx', mode })
      if ((await this.read(sourceId)).revision !== revision) throw new Error('Config changed during save. Reload before trying again.')
      await rename(temporary, target)
      temporary = undefined
      return { document: await this.read(sourceId), backup }
    } finally {
      if (temporary) await unlink(temporary).catch(() => {})
      this.saving.delete(registered)
    }
  }
}
