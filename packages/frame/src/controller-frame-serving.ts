import type { ServeFrame } from './frame-write.ts'

export class ControllerFrameServing extends EventTarget {
  private servedBy: ServeFrame | undefined
  protected frameServingChanged?: () => void
  constructor(serveFrame?: ServeFrame) {
    super()
    this.servedBy = serveFrame
  }
  get serveFrame(): ServeFrame | undefined {
    return this.servedBy
  }
  set serveFrame(value: ServeFrame | undefined) {
    this.servedBy = value
    this.frameServingChanged?.()
  }
}
