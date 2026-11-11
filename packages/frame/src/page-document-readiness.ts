export class PageDocumentReadiness {
  private writes = 0
  loaded: number | undefined
  frameReady = false
  final = false

  get documentIsLoaded(): boolean {
    return this.loaded === this.writes
  }

  reset() {
    this.frameReady = false
    this.loaded = undefined
    this.final = false
  }

  write(iframe: HTMLIFrameElement, srcdoc: string, provisional = false) {
    const written = ++this.writes
    this.reset()
    this.final = !provisional
    iframe.addEventListener(
      'load',
      () => {
        if (written === this.writes) this.loaded = written
      },
      { once: true },
    )
    iframe.srcdoc = srcdoc
  }
}
