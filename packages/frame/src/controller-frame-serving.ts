import type { FormsOption } from './bridge.ts'
import type { ServeFrame } from './frame-write.ts'
import type { FontsOptions } from './page-fonts.ts'

export class ControllerFrameServing extends EventTarget {
  private servedBy: ServeFrame | undefined
  private formsValue: FormsOption | undefined
  private fontsValue: FontsOptions | undefined
  protected frameServingChanged?: () => void
  constructor(serveFrame?: ServeFrame, forms?: FormsOption, fonts?: FontsOptions) {
    super()
    this.servedBy = serveFrame
    this.formsValue = forms
    this.fontsValue = fonts
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
  get fonts(): FontsOptions | undefined {
    return this.fontsValue
  }
  set fonts(value: FontsOptions | undefined) {
    if (value === this.fontsValue) return
    this.fontsValue = value
    this.frameServingChanged?.()
  }
}
