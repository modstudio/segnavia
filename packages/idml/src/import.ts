import type { Book } from '@segnavia/format'
import { modelToBook } from './map-book.ts'
import { idmlModel } from './model.ts'
import { readZip } from './zip.ts'

const IDML_MIMETYPE = 'application/vnd.adobe.indesign-idml-package'

export type IdmlImportOptions = Record<never, never>

export interface IdmlImportReport {
  partsRead: string[]
  unsupportedElements: Record<string, number>
}

export interface IdmlImportResult {
  book: Book
  report: IdmlImportReport
}

export async function importIdml(bytes: Uint8Array, _options: IdmlImportOptions = {}): Promise<IdmlImportResult> {
  const entries = await readZip(bytes)
  const byName = new Map(entries.map((entry) => [entry.name, entry.bytes]))
  const mimetype = byName.get('mimetype')
  if (!mimetype) throw new Error('the IDML mimetype entry is missing; add the required mimetype entry to clear this refusal')
  const value = new TextDecoder().decode(mimetype)
  if (value !== IDML_MIMETYPE) {
    throw new Error(`the IDML mimetype entry is ${JSON.stringify(value)}, not ${IDML_MIMETYPE}; use the IDML package mimetype to clear this refusal`)
  }
  if (!byName.has('designmap.xml')) {
    throw new Error('the IDML designmap.xml entry is missing; add the required designmap.xml entry to clear this refusal')
  }
  const model = idmlModel(entries)
  return { book: modelToBook(model), report: { partsRead: model.partsRead, unsupportedElements: model.unsupportedElements } }
}
