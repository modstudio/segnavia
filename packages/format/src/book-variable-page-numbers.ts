import { formatNumber, type NumberSystem } from './numbering.ts'

export interface BookVariableNumberPage {
  flow: string
  blank: boolean
  counted: boolean
  record: boolean
}

export interface BookVariablePageNumbers {
  documentFolios: Array<string | null>
  documentTotal: string
  recordFolios: Array<string | null>
  recordTotals: Record<string, string>
}

export function bookVariablePageNumbers(pages: readonly BookVariableNumberPage[], system: NumberSystem): BookVariablePageNumbers {
  let documentIndex = 0
  const recordIndexes = new Map<string, number>()
  const documentFolios: Array<string | null> = []
  const recordFolios: Array<string | null> = []
  for (const page of pages) {
    if (page.counted) documentIndex += 1
    documentFolios.push(page.blank || !page.counted ? null : formatNumber(documentIndex, system))
    if (!page.record || !page.counted) {
      recordFolios.push(null)
      continue
    }
    const recordIndex = (recordIndexes.get(page.flow) ?? 0) + 1
    recordIndexes.set(page.flow, recordIndex)
    recordFolios.push(page.blank ? null : formatNumber(recordIndex, system))
  }
  return {
    documentFolios,
    documentTotal: formatNumber(documentIndex, system),
    recordFolios,
    recordTotals: Object.fromEntries([...recordIndexes].map(([flow, count]) => [flow, formatNumber(count, system)])),
  }
}
