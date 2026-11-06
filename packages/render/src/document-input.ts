import { Document, type DocumentInput, Page, type PageInput, type Page as PageValue, printedFromDocument } from '@segnavia/format'

export type PageOrPrintedInput = PageInput | DocumentInput

export function pageOrPrintedFromInput(input: PageOrPrintedInput): PageValue {
  if (typeof input === 'object' && input !== null && 'type' in input && input.type === 'document') {
    return printedFromDocument(Document.parse(input))
  }
  const page = Page.parse(input)
  if (page.printedPages !== undefined) {
    throw new Error(
      "a printed-pages input must be a Document with kind printed; replace printedPages with { type: 'document', kind: 'printed', ... } to clear this refusal",
    )
  }
  return page
}
