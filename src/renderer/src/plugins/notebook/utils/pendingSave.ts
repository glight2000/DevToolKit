/** Keeps the latest edit and serializes writes so an older save cannot win. */
export class PendingSave {
  private pending: (() => Promise<void>) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> = Promise.resolve()

  schedule(save: () => Promise<void>): void {
    this.pending = save
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.flush().catch((error) => console.error('Failed to save document:', error))
    }, 1000)
  }

  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const save = this.pending
    this.pending = null
    if (save) {
      this.inFlight = this.inFlight.catch(() => {}).then(save)
    }
    return this.inFlight
  }
}
