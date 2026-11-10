import {
  type Plan,
  PRINTED_PAGE_DOCUMENT_NUMBER_PATH,
  PRINTED_PAGE_DOCUMENT_TOTAL_PATH,
  PRINTED_PAGE_NUMBER_PATH,
  PRINTED_PAGE_TOTAL_PATH,
  type PreflightEntry,
  RECORD_COUNT_PATH,
  RECORD_INDEX_PATH,
} from '@segnavia/format'

export type ComposerFolioPlan = Pick<Plan, 'folios' | 'total' | 'documentFolios' | 'documentTotal' | 'recordTotals' | 'records'>

export const COMPOSER_FURNITURE_PATHS = {
  number: PRINTED_PAGE_NUMBER_PATH,
  total: PRINTED_PAGE_TOTAL_PATH,
  documentNumber: PRINTED_PAGE_DOCUMENT_NUMBER_PATH,
  documentTotal: PRINTED_PAGE_DOCUMENT_TOTAL_PATH,
  recordIndex: RECORD_INDEX_PATH,
  recordCount: RECORD_COUNT_PATH,
}

export type ComposerFurniturePaths = typeof COMPOSER_FURNITURE_PATHS

export function composerFurnitureValues(
  plan: ComposerFolioPlan,
  flow: string,
  index: number,
  paths: ComposerFurniturePaths,
): Record<string, string | undefined> {
  const record = plan.records[flow]
  return {
    [paths.number]: plan.folios[index] ?? undefined,
    [paths.total]: plan.recordTotals[flow] ?? plan.total,
    [paths.documentNumber]: plan.documentFolios[index] ?? undefined,
    [paths.documentTotal]: plan.documentTotal,
    [paths.recordIndex]: record?.index ?? '',
    [paths.recordCount]: record?.count ?? '',
  }
}

export interface FurnitureValues {
  folio?: string
  runningHead?: string
  marks?: Record<string, { first: string; last: string }>
  total?: string
}

export interface RegionExcess {
  block: number
  inline: number
}

export function markFurnitureOverflow(region: HTMLElement, page: Element, entries: PreflightEntry[]): void {
  const excess = region.scrollHeight - region.clientHeight
  if (excess <= 0.5) return
  const kind = region.hasAttribute('data-segnavia-head') ? 'head' : 'foot'
  const parent = region.getAttribute('data-segnavia-parent') ?? ''
  const subject = `${parent}:${kind}`
  if (entries.some((entry) => entry.check === 'furniture-overset' && entry.subject === subject)) return
  entries.push({
    check: 'furniture-overset',
    subject,
    message: `Parent page ${parent} ${kind} furniture is overset; shorten its content or enlarge the ${kind} region to clear this refusal.`,
    location: { folio: page.getAttribute('data-segnavia-folio') ?? '' },
  })
}

export function markRegionOverflow(root: Element, folio: string, excessOf: (element: Element) => RegionExcess, entries: PreflightEntry[]): void {
  const template = root.getAttribute('data-template') ?? ''
  const regions = root.querySelectorAll('[data-region]')
  for (const region of regions) {
    const name = region.getAttribute('data-region')
    if (!name) continue
    const excess = excessOf(region)
    if (excess.block <= 0.5 && excess.inline <= 0.5) continue
    const subject = `${template}:${name}`
    if (entries.some((entry) => entry.check === 'region-overset' && entry.subject === subject)) continue
    entries.push({
      check: 'region-overset',
      subject,
      message: `Template ${template} region ${name} is overset; shorten its content, enlarge the region, or lower its fit minimum to clear this refusal.`,
      location: { folio },
    })
  }
}

export function dressPlanPages<T>(
  plan: { pages: T[] },
  only: number | null | undefined,
  place: (pages: HTMLElement, page: T, index: number) => void,
): HTMLElement {
  const pages = document.createElement('div')
  pages.setAttribute('data-segnavia-pages', '')
  for (let index = 0; index < plan.pages.length; index += 1) {
    if (only !== null && only !== undefined && only !== index + 1) continue
    const page = plan.pages[index]
    if (page) place(pages, page, index)
  }
  return pages
}

export function fillFurniture(
  root: Element,
  html: string,
  values: FurnitureValues,
  dir: string | undefined,
  lang: string | undefined,
  slots: Record<string, string | undefined>,
  fillMotifs: (source: string, values: FurnitureValues, dir?: string, lang?: string) => string,
): void {
  root.innerHTML = fillMotifs(html, values, dir, lang)
  const bindings = root.querySelectorAll('[data-slot-value]')
  for (const binding of bindings) {
    const path = binding.getAttribute('data-slot-value')
    if (!path || !Object.hasOwn(slots, path)) continue
    const value = slots[path]
    if (value === undefined) {
      binding.remove()
      continue
    }
    binding.removeAttribute('data-slot-value')
    binding.textContent = value
    if (!binding.hasAttribute('dir')) binding.setAttribute('dir', 'auto')
  }
}
