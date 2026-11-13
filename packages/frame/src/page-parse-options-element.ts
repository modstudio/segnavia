import type { DocumentParseOptions } from '@segnavia/format'
import type { AlertLabels } from '@segnavia/html'
import { PageAsOfElement } from './page-as-of-element.ts'

export type PageParseOption = 'alertLabels' | 'newId'

export abstract class PageParseOptionsElement extends PageAsOfElement {
  private alertLabelOptions: Partial<AlertLabels> | undefined
  private newIdOption: DocumentParseOptions['newId']

  get alertLabels(): Partial<AlertLabels> | undefined {
    return this.alertLabelOptions
  }

  set alertLabels(value: Partial<AlertLabels> | undefined) {
    this.alertLabelOptions = value
    this.pageParseOptionsChanged('alertLabels')
  }

  get newId(): DocumentParseOptions['newId'] {
    return this.newIdOption
  }

  set newId(value: DocumentParseOptions['newId']) {
    if (Object.is(value, this.newIdOption)) return
    this.newIdOption = value
    this.pageParseOptionsChanged('newId')
  }

  protected abstract pageParseOptionsChanged(option: PageParseOption): void
}
