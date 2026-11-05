import type { Book } from '@segnavia/format'
import { conversionFor, inspectModel } from './conversion.ts'
import { modelToBook } from './map-book.ts'
import { idmlModel } from './model.ts'
import { refusal } from './refusal.ts'
import { type IdmlReportData, ReportCollector } from './report.ts'
import type { IdmlAnswers, IdmlImportOptions, IdmlInspection } from './types.ts'
import { readZip } from './zip.ts'

const IDML_MIMETYPE = 'application/vnd.adobe.indesign-idml-package'

export interface IdmlImportReport extends IdmlReportData {
  partsRead: string[]
}

export interface IdmlImportResult {
  book: Book
  report: IdmlImportReport
}

async function readModel(bytes: Uint8Array) {
  const entries = await readZip(bytes)
  const byName = new Map(entries.map((entry) => [entry.name, entry.bytes]))
  const mimetype = byName.get('mimetype')
  if (!mimetype) throw refusal('the IDML mimetype entry is missing', 'add the required mimetype entry')
  const value = new TextDecoder().decode(mimetype)
  if (value !== IDML_MIMETYPE) throw refusal(`the IDML mimetype entry is ${JSON.stringify(value)}, not ${IDML_MIMETYPE}`, 'use the IDML package mimetype')
  if (!byName.has('designmap.xml')) throw refusal('the IDML designmap.xml entry is missing', 'add the required designmap.xml entry')
  return idmlModel(entries)
}

export async function inspectIdml(bytes: Uint8Array, answers: IdmlAnswers = {}): Promise<IdmlInspection> {
  return inspectModel(await readModel(bytes), answers)
}

export async function importIdml(bytes: Uint8Array, options: IdmlImportOptions = {}): Promise<IdmlImportResult> {
  const model = await readModel(bytes)
  const conversion = conversionFor(model, options.answers)
  const collector = new ReportCollector(model.report)
  const book = modelToBook(model, collector, options, conversion)
  return { book, report: { partsRead: model.partsRead, ...collector.data() } }
}
