export interface PdfTaggingFacts {
  book: boolean
  composed: boolean
  printedDocument: boolean
}

export function printTagged(facts: PdfTaggingFacts): boolean {
  return !facts.composed && (facts.book || facts.printedDocument)
}

export function pagesTagged(printedDocuments: readonly boolean[], composed: boolean): boolean {
  return printedDocuments.length > 0 && printedDocuments.every((printedDocument) => printTagged({ book: false, composed, printedDocument }))
}
