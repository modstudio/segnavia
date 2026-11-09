export interface ComposerFolioPlan {
  folios: Array<string | null>
  total: string
  documentFolios: Array<string | null>
  documentTotal: string
  recordTotals: Record<string, string>
  records: Record<string, { index: string; count: string }>
}

export function composerFurnitureValues(plan: ComposerFolioPlan, flow: string, index: number): Record<string, string | undefined> {
  const record = plan.records[flow]
  return {
    'printedPage.number': plan.folios[index] ?? undefined,
    'printedPage.total': plan.recordTotals[flow] ?? plan.total,
    'printedPage.documentNumber': plan.documentFolios[index] ?? undefined,
    'printedPage.documentTotal': plan.documentTotal,
    'record.index': record?.index ?? '',
    'record.count': record?.count ?? '',
  }
}
