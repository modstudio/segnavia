import {
  boundComposeProgress,
  type ComposeProgress,
  type HeadTemplate,
  headTemplatePlacements,
  MOTIF_ATTRIBUTE,
  type PreflightEntry,
  type PreflightPageFacts,
} from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { type PaginateBookPage, type PaginateFlow, pageBlockRange, resolveHeadTemplate } from '@segnavia/layout'
import { decideProgressYield } from './composer-progress.ts'

interface ProgressPages {
  setAttribute(name: string, value: string): void
}

export async function dressPlanPagesImplementation<T, P extends ProgressPages>(
  plan: { pages: readonly T[] },
  only: number | null | undefined,
  report: (progress: ComposeProgress) => void,
  place: (pages: P, page: T, index: number) => void,
  createPages: () => P,
  now: () => number,
  yieldTask: () => Promise<void>,
  progressEnabled = true,
): Promise<P> {
  const pages = createPages()
  pages.setAttribute('data-segnavia-pages', '')
  const selected = plan.pages.flatMap((page, index) => (page && (only === null || only === undefined || only === index + 1) ? [{ page, index }] : []))
  const total = selected.length
  if (!progressEnabled) {
    for (const entry of selected) place(pages, entry.page, entry.index)
    return pages
  }
  let dressed = 0
  let yieldedAt = now()
  if (total === 0) {
    const progress = boundComposeProgress({ pages: 0, total: 0 })
    if (progress) report(progress)
  }
  for (const entry of selected) {
    place(pages, entry.page, entry.index)
    dressed += 1
    const last = dressed === total
    const current = now()
    if (!decideProgressYield({ sinceYieldMs: current - yieldedAt, last })) continue
    const progress = boundComposeProgress({ pages: dressed, total })
    if (progress) report(progress)
    await yieldTask()
    yieldedAt = now()
  }
  return pages
}

export function embeddedDressPlanPagesFunctions(yieldTaskName: string): string {
  return `${embedFunction('dressPlanPagesImplementation', dressPlanPagesImplementation)}
var dressPlanPages=function(plan,only,report,place){return dressPlanPagesImplementation(plan,only,report,place,function(){return document.createElement('div');},function(){return performance.now();},${yieldTaskName},config.progress);};`
}

export function fillRegion(html: string, values: { heads: Record<string, string> }, _direction?: string, _lang?: string): string {
  return fillRegionImplementation(html, values, headTemplatePlacements, MOTIF_ATTRIBUTE)
}

export function fillRegionImplementation(
  html: string,
  values: { heads: Record<string, string> },
  placementsIn: typeof headTemplatePlacements,
  motifAttribute: string,
): string {
  const placements = placementsIn(html).filter(
    (placement, index, all) => !all.some((container, other) => other !== index && container.start < placement.start && container.end >= placement.end),
  )
  let output = html
  for (const placement of [...placements].reverse()) {
    const value = Object.hasOwn(values.heads, placement.name) ? values.heads[placement.name] : undefined
    if (!placement.bounded) {
      output = `${output.slice(0, placement.start)}${output.slice(placement.openEnd)}`
      continue
    }
    const opening = html.slice(placement.start, placement.openEnd)
    const cleaned = opening.replace(new RegExp(`\\s${motifAttribute}(?:-[\\w-]+)?\\s*=\\s*(?:(["'])([^"']*)\\1|[^\\s>]+)`, 'gi'), '').replace(/\/\s*>$/, '>')
    const replacement = value ? `${cleaned}${value}</${placement.tag}>` : ''
    output = `${output.slice(0, placement.start)}${replacement}${output.slice(placement.end)}`
  }
  return output
}

export function resolveRegionHeads(
  templates: readonly HeadTemplate[],
  variables: Readonly<Record<string, string>>,
  recordSlots: Readonly<Record<string, string | undefined>>,
  direction?: string,
  lang?: string,
): Record<string, string> {
  return resolveRegionHeadsImplementation(templates, variables, recordSlots, direction, lang, resolveHeadTemplate)
}

export function resolveRegionHeadsImplementation(
  templates: readonly HeadTemplate[],
  variables: Readonly<Record<string, string>>,
  recordSlots: Readonly<Record<string, string | undefined>>,
  direction: string | undefined,
  lang: string | undefined,
  resolve: typeof resolveHeadTemplate,
): Record<string, string> {
  const declared = direction === 'ltr' || direction === 'rtl' || direction === 'auto' ? direction : undefined
  return Object.fromEntries(templates.map((template) => [template.name, resolve(template, variables, recordSlots, declared, lang)]))
}

export interface RegionExcess {
  block: number
  inline: number
}

export function preflightPageFacts(
  pages: readonly PaginateBookPage[],
  folios: readonly (string | null)[],
  flows: readonly PaginateFlow[],
): PreflightPageFacts[] {
  return pages.map((page, index) => {
    const range = pageBlockRange(flows, page)
    const first = range.first?.id
    const last = range.last?.id
    return { folio: folios[index] ?? '', ...(first ? { first } : {}), ...(last ? { last } : {}) }
  })
}

export function markFurnitureOverflow(region: HTMLElement, page: Element, entries: PreflightEntry[]): void {
  const shared = globalThis as typeof globalThis & {
    applyRegionOverflow?: (region: HTMLElement, folio: string, entries: PreflightEntry[], facts: unknown[], refusal: boolean) => string | undefined
    preflightRegions?: unknown[]
  }
  if (shared.applyRegionOverflow) {
    const refusal = shared.applyRegionOverflow(region, page.getAttribute('data-segnavia-folio') ?? '', entries, shared.preflightRegions ?? [], true)
    if (refusal) throw new Error(refusal)
    if ((region.getAttribute('data-overflow') ?? 'grow') !== 'grow') return
  }
  const excess = region.scrollHeight - region.clientHeight
  if (excess <= 0.5) return
  const kind = region.getAttribute('data-segnavia-region') ?? ''
  const parent = region.getAttribute('data-segnavia-parent') ?? ''
  const subject = `${parent}:${kind}`
  if (entries.some((entry) => entry.check === 'furniture-overset' && entry.subject === subject)) return
  entries.push({
    check: 'furniture-overset',
    subject,
    message: `Parent page ${parent} region ${kind} is overset; shorten its content or enlarge the ${kind} region to clear it.`,
    location: { folio: page.getAttribute('data-segnavia-folio') ?? '' },
  })
}

export function markRegionOverflow(root: Element, folio: string, excessOf: (element: Element) => RegionExcess, entries: PreflightEntry[]): void {
  const template = root.getAttribute('data-template') ?? ''
  const regions = root.querySelectorAll('[data-region]')
  for (const region of regions) {
    const name = region.getAttribute('data-region')
    if (!name) continue
    const shared = globalThis as typeof globalThis & {
      applyRegionOverflow?: (region: HTMLElement, folio: string, entries: PreflightEntry[], facts: unknown[], refusal: boolean) => string | undefined
      preflightRegions?: unknown[]
    }
    if (shared.applyRegionOverflow) {
      const refusal = shared.applyRegionOverflow(region as HTMLElement, folio, entries, shared.preflightRegions ?? [], true)
      if (refusal) throw new Error(refusal)
      if ((region.getAttribute('data-overflow') ?? 'grow') !== 'grow') continue
    }
    const excess = excessOf(region)
    if (excess.block <= 0.5 && excess.inline <= 0.5) continue
    const subject = `${template}:${name}`
    if (entries.some((entry) => entry.check === 'region-overset' && entry.subject === subject)) continue
    entries.push({
      check: 'region-overset',
      subject,
      message: `Template ${template} region ${name} is overset; shorten its content, enlarge the region, or lower its fit minimum to clear it.`,
      location: { folio },
    })
  }
}

export function fillFurniture(
  root: Element,
  html: string,
  heads: Record<string, string>,
  slots: Record<string, string | undefined>,
  dir: string | undefined,
  lang: string | undefined,
): void {
  root.innerHTML = fillRegion(html, { heads }, dir, lang)
  const bindings = root.querySelectorAll('[data-slot-value]')
  for (const binding of bindings) {
    const path = binding.getAttribute('data-slot-value')
    if (!path?.startsWith('record.')) continue
    const key = path.slice('record.'.length)
    if (!Object.hasOwn(slots, key)) continue
    const value = slots[key]
    if (value === undefined) {
      binding.remove()
      continue
    }
    binding.removeAttribute('data-slot-value')
    binding.textContent = value
    if (!binding.hasAttribute('dir')) binding.setAttribute('dir', 'auto')
  }
}
