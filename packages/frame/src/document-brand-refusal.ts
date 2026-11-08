import type { Document } from '@segnavia/format'

export function refuseNamedDocumentBrand(document: Document, valueEntry: string): void {
  if (document.brand === undefined) return
  throw new Error(
    `Document names brand ${JSON.stringify(document.brand)}; resolve it with resolveBrand, lower with that brand, and pass the lowered value to ${valueEntry} to clear this refusal.`,
  )
}
