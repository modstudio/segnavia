import type { AlertLabels } from '@segnavia/html'
import { PageAsOfElement } from './page-as-of-element.ts'

export abstract class PageParseOptionsElement extends PageAsOfElement {
  private alertLabelOptions: Partial<AlertLabels> | undefined
  private newIdOption: (() => string) | undefined

  get alertLabels(): Partial<AlertLabels> | undefined {
    return this.alertLabelOptions
  }

  set alertLabels(value: Partial<AlertLabels> | undefined) {
    this.alertLabelOptions = value
    this.pageParseOptionsChanged(true)
  }

  get newId(): (() => string) | undefined {
    return this.newIdOption
  }

  set newId(value: (() => string) | undefined) {
    this.newIdOption = value
    this.pageParseOptionsChanged(false)
  }

  protected abstract pageParseOptionsChanged(reloadValue: boolean): void
}
