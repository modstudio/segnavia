import { Document, type DocumentInput, Page, type PageInput, printedFromDocument, type Page as PageValue } from '@segnavia/format'

function isDocument(input: PageInput | DocumentInput): input is DocumentInput {
  return typeof input === 'object' && input !== null && 'type' in input && input.type === 'document'
}

export type PageOrPrintedInput = PageInput | DocumentInput

export function pageOrPrintedFromInput(input: PageOrPrintedInput): PageValue {
  if (isDocument(input)) return printedFromDocument(Document.parse(input))
  const page = Page.parse(input)
  if (page.printedPages !== undefined) {
    throw new Error("a printed-pages input must be a Document with kind printed; replace printedPages with { type: 'document', kind: 'printed', ... } to clear this refusal")
  }
  return page
}
