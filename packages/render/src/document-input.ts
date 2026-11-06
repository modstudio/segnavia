import { Document, type DocumentInput, type Page as PageValue, pageFromDocument, printedFromDocument } from '@segnavia/format'

export type PageOrPrintedInput = DocumentInput

export function pageOrPrintedFromInput(input: PageOrPrintedInput): PageValue {
  const document = Document.parse(input)
  if (document.kind === 'page') return pageFromDocument(document)
  if (document.kind === 'printed') return printedFromDocument(document)
  throw new Error(`document kind ${document.kind} is not accepted here; use kind page or printed to clear this refusal`)
}
