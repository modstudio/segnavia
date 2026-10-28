import type { Book } from '@segnavia/format'
import { modelToBook } from './map-book.ts'
import { idmlModel } from './model.ts'
import { refusal } from './refusal.ts'
import { type IdmlFontUse, ReportCollector } from './report.ts'
import { readZip } from './zip.ts'

const IDML_MIMETYPE = 'application/vnd.adobe.indesign-idml-package'

export type IdmlImportOptions = Record<never, never>

export interface IdmlImportReport {
  partsRead: string[]
  unsupportedElements: Record<string, number>
  unsupportedStyleProperties: Record<string, number>
  unsupportedOverrideProperties: Record<string, number>
  unsupportedSpecialCharacters: Record<string, number>
  unsupportedLanguages: Record<string, number>
  spotColors: Record<string, number>
  locations: Record<string, string[]>
  fonts: IdmlFontUse[]
}

export interface IdmlImportResult {
  book: Book
  report: IdmlImportReport
}

export async function importIdml(bytes: Uint8Array, _options: IdmlImportOptions = {}): Promise<IdmlImportResult> {
  const entries = await readZip(bytes)
  const byName = new Map(entries.map((entry) => [entry.name, entry.bytes]))
  const mimetype = byName.get('mimetype')
  if (!mimetype) throw refusal('the IDML mimetype entry is missing', 'add the required mimetype entry')
  const value = new TextDecoder().decode(mimetype)
  if (value !== IDML_MIMETYPE) {
    throw refusal(`the IDML mimetype entry is ${JSON.stringify(value)}, not ${IDML_MIMETYPE}`, 'use the IDML package mimetype')
  }
  if (!byName.has('designmap.xml')) {
    throw refusal('the IDML designmap.xml entry is missing', 'add the required designmap.xml entry')
  }
  const model = idmlModel(entries)
  const collector = new ReportCollector(model.report)
  const book = modelToBook(model, collector)
  return { book, report: { partsRead: model.partsRead, ...collector.data() } }
}
