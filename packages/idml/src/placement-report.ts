import type { IdmlModel } from './model.ts'
import type { ReportCollector } from './report.ts'
import type { IdmlPage } from './types.ts'

function reportPage(page: IdmlPage, consumed: boolean, report: ReportCollector): void {
  for (const link of page.links ?? []) {
    report.link(link.uri, link.location)
    if (!consumed) report.add(report.unsupportedElements, 'link', link.location)
  }
  for (const item of page.unmapped ?? []) report.add(report.unsupportedElements, item.name, item.location)
  if (!consumed) for (const art of page.art ?? []) report.add(report.unsupportedElements, 'polygon art group', art.location)
}

export function reportPlacements(model: IdmlModel, consumedPages: Set<IdmlPage>, report: ReportCollector): void {
  for (const spread of model.spreads) for (const page of spread.pages) reportPage(page, consumedPages.has(page), report)
  for (const master of model.masterSpreads) for (const page of master.pages) reportPage(page, false, report)
}
