import { type Media, mediaTextDirection, Placement, type Placement as PlacementValue } from '@segnavia/format'
import type { Element } from 'domhandler'
import { DATA_IMAGE, elements, parse, serialize } from './sanitize.ts'

export const PLACEMENT_ATTRIBUTES = ['data-segnavia-media', 'data-segnavia-page', 'data-segnavia-box', 'data-segnavia-crop'] as const

export type ResolvedPlacement = { kind: 'media'; media: Media; src: string }
export type ResolvePlacement = (
  placement: PlacementValue,
  context: { purpose: 'screen' | 'print'; width: number; signal: AbortSignal },
) => Promise<ResolvedPlacement | undefined>

export interface PlacementPlanEntry {
  index: number
  placement: PlacementValue
  alt?: string
  lang?: string
  dir?: string
  width?: number
}

export interface PlacementRefusal {
  index: number
  address?: string
  page?: string | number
  message: string
}

export interface PlacementPlan {
  entries: PlacementPlanEntry[]
  refusals: PlacementRefusal[]
}

export type PlacementReport = (entry: {
  address: string | undefined
  page: string | number | undefined
  reason: 'missing' | 'refused-src' | 'invalid' | 'failed'
  message?: string
}) => void

export interface PlacementsOptions {
  resolve: ResolvePlacement
  report?: PlacementReport
}

function positiveInteger(value: string | undefined): number | undefined {
  return value !== undefined && /^[1-9][0-9]*$/.test(value) ? Number(value) : undefined
}

function pageSelector(value: string | undefined): string | number | undefined {
  if (value === undefined || value === '') return undefined
  return /^[1-9][0-9]*$/.test(value) ? Number(value) : value
}

function cropValue(value: string | undefined): PlacementValue['crop'] {
  if (value === undefined) return undefined
  const edges = value.trim().split(/\s+/)
  if (edges.length < 1 || edges.length > 4) return { top: value }
  const [top, second, third, fourth] = edges
  return {
    top,
    right: second ?? top,
    bottom: third ?? top,
    left: fourth ?? second ?? top,
  }
}

function plannedElement(element: Element, index: number): PlacementPlanEntry | PlacementRefusal {
  const address = element.attribs[PLACEMENT_ATTRIBUTES[0]]
  const page = pageSelector(element.attribs[PLACEMENT_ATTRIBUTES[1]])
  try {
    const placement = Placement.parse(
      {
        kind: 'media',
        address: address as string,
        ...(page === undefined ? {} : { page }),
        ...(element.attribs[PLACEMENT_ATTRIBUTES[2]] === undefined ? {} : { box: element.attribs[PLACEMENT_ATTRIBUTES[2]] as PlacementValue['box'] }),
        ...(element.attribs[PLACEMENT_ATTRIBUTES[3]] === undefined ? {} : { crop: cropValue(element.attribs[PLACEMENT_ATTRIBUTES[3]]) }),
      },
      'page',
    )
    return {
      index,
      placement,
      ...('alt' in element.attribs ? { alt: element.attribs.alt } : {}),
      ...('lang' in element.attribs ? { lang: element.attribs.lang } : {}),
      ...('dir' in element.attribs ? { dir: element.attribs.dir } : {}),
      ...(positiveInteger(element.attribs.width) === undefined ? {} : { width: positiveInteger(element.attribs.width) }),
    }
  } catch (error) {
    return { index, address, page, message: error instanceof Error ? error.message : String(error) }
  }
}

export function placementPlan(html: string): PlacementPlan {
  const found = elements(parse(html).children)
  const planned = found.flatMap((element, index) =>
    element.name.toLowerCase() === 'img' && PLACEMENT_ATTRIBUTES[0] in element.attribs ? [plannedElement(element, index)] : [],
  )
  return {
    entries: planned.filter((entry): entry is PlacementPlanEntry => 'placement' in entry),
    refusals: planned.filter((entry): entry is PlacementRefusal => !('placement' in entry)),
  }
}

function placeholder(element: Element): void {
  const authoredWidth = positiveInteger(element.attribs.width)
  const authoredHeight = positiveInteger(element.attribs.height)
  const width = authoredWidth ?? (authoredHeight === undefined ? 400 : Math.round((authoredHeight * 4) / 3))
  const height = authoredHeight ?? (authoredWidth === undefined ? 300 : Math.round((authoredWidth * 3) / 4))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#eee"/><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#aaa"/></svg>`
  element.attribs.src = `data:image/svg+xml,${encodeURIComponent(svg)}`
  element.attribs['data-segnavia-placement'] = 'missing'
  if (!('alt' in element.attribs)) element.attribs.alt = ''
  for (const attribute of PLACEMENT_ATTRIBUTES) delete element.attribs[attribute]
}

function applyResolved(element: Element, entry: PlacementPlanEntry, resolved: ResolvedPlacement): void {
  element.attribs.src = resolved.src
  if (entry.alt === undefined && resolved.media.alt) element.attribs.alt = resolved.media.alt.text
  if (entry.lang === undefined && entry.dir === undefined && (resolved.media.alt?.lang || resolved.media.alt?.dir)) {
    if (resolved.media.alt.lang) element.attribs.lang = resolved.media.alt.lang
    element.attribs.dir = mediaTextDirection(resolved.media.alt)
  }
  const crop = entry.placement.crop
  if (crop) {
    const declaration = `object-view-box: inset(${crop.top ?? 0} ${crop.right ?? 0} ${crop.bottom ?? 0} ${crop.left ?? 0})`
    const authored = element.attribs.style?.trim()
    element.attribs.style = authored ? `${authored.replace(/;?$/, ';')} ${declaration}` : declaration
  }
  for (const attribute of PLACEMENT_ATTRIBUTES) delete element.attribs[attribute]
}

function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const aborted = () => reject(signal.reason)
    signal.addEventListener('abort', aborted, { once: true })
    work().then(
      (value) => {
        signal.removeEventListener('abort', aborted)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', aborted)
        reject(error)
      },
    )
  })
}

export async function resolvePlacements(
  html: string,
  options: { resolvePlacement: ResolvePlacement; purpose: 'screen' | 'print'; width: number; signal: AbortSignal; report?: PlacementReport },
): Promise<string> {
  const plan = placementPlan(html)
  if (plan.entries.length === 0 && plan.refusals.length === 0) return html
  options.signal.throwIfAborted()
  const document = parse(html)
  const found = elements(document.children)
  for (const refusal of plan.refusals) {
    const element = found[refusal.index]
    if (element) placeholder(element)
    options.report?.({ address: refusal.address, page: refusal.page, reason: 'invalid', message: refusal.message })
  }
  await Promise.all(
    plan.entries.map(async (entry) => {
      const element = found[entry.index]
      if (!element) return
      try {
        const resolved = await abortable(
          () =>
            options.resolvePlacement(entry.placement, {
              purpose: options.purpose,
              width: entry.width ?? options.width,
              signal: options.signal,
            }),
          options.signal,
        )
        options.signal.throwIfAborted()
        if (!resolved) {
          placeholder(element)
          options.report?.({ address: entry.placement.address, page: entry.placement.page, reason: 'missing' })
        } else if (!DATA_IMAGE.test(resolved.src)) {
          placeholder(element)
          options.report?.({ address: entry.placement.address, page: entry.placement.page, reason: 'refused-src' })
        } else applyResolved(element, entry, resolved)
      } catch (error) {
        if (options.signal.aborted) throw options.signal.reason
        placeholder(element)
        options.report?.({
          address: entry.placement.address,
          page: entry.placement.page,
          reason: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }),
  )
  options.signal.throwIfAborted()
  return serialize(document)
}
