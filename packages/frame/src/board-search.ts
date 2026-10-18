export class BoardSearchPolicy {
  private version = 0
  private controller: AbortController | undefined

  begin(): { version: number; signal: AbortSignal } {
    this.controller?.abort()
    this.controller = new AbortController()
    this.version += 1
    return { version: this.version, signal: this.controller.signal }
  }

  clear() {
    this.controller?.abort()
    this.controller = undefined
    this.version += 1
  }

  accepts(version: number): boolean {
    return version === this.version && !this.controller?.signal.aborted
  }
}
