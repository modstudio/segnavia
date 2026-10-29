import type { Book, FontReferenceInput } from '@segnavia/format'
import { modelToBook } from './map-book.ts'
import { idmlModel } from './model.ts'
import { refusal } from './refusal.ts'
import { type IdmlReportData, ReportCollector } from './report.ts'
import type { IdmlFont } from './types.ts'
import { readZip } from './zip.ts'

const IDML_MIMETYPE = 'application/vnd.adobe.indesign-idml-package'

export interface IdmlImportOptions {
  font?: (font: IdmlFont) => FontReferenceInput | undefined
}

export interface IdmlImportReport extends IdmlReportData {
  partsRead: string[]
}

export interface IdmlImportResult {
  book: Book
  report: IdmlImportReport
}

export async function importIdml(bytes: Uint8Array, options: IdmlImportOptions = {}): Promise<IdmlImportResult> {
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
  const book = modelToBook(model, collector, options)
  return { book, report: { partsRead: model.partsRead, ...collector.data() } }
}
