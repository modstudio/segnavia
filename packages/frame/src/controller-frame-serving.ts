import type { FormsOption } from './bridge.ts'
import type { ServeFrame } from './frame-write.ts'

export class ControllerFrameServing extends EventTarget {
  private servedBy: ServeFrame | undefined
  private formsValue: FormsOption | undefined
  protected frameServingChanged?: () => void
  constructor(serveFrame?: ServeFrame, forms?: FormsOption) {
    super()
    this.servedBy = serveFrame
    this.formsValue = forms
  }
  get serveFrame(): ServeFrame | undefined {
    return this.servedBy
  }
  set serveFrame(value: ServeFrame | undefined) {
    this.servedBy = value
    this.frameServingChanged?.()
  }
  get forms(): FormsOption | undefined {
    return this.formsValue
  }
  set forms(value: FormsOption | undefined) {
    if (value === this.formsValue) return
    this.formsValue = value
    this.frameServingChanged?.()
  }
}
