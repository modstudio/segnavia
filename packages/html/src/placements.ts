import { type AsOfDay, type DocumentInput, type Media, mediaTextDirection, Placement, type Placement as PlacementValue, type PreflightEntry } from '@segnavia/format'
import type { Element } from 'domhandler'
import { elements, parse, safeImageSource, serialize } from './sanitize.ts'

export const PLACEMENT_ATTRIBUTES = ['data-segnavia-media', 'data-segnavia-page', 'data-segnavia-box', 'data-segnavia-crop'] as const
const [MEDIA_ATTRIBUTE, PAGE_ATTRIBUTE, BOX_ATTRIBUTE, CROP_ATTRIBUTE] = PLACEMENT_ATTRIBUTES

export type ResolvedPlacement = { kind: 'media'; media: Media; src: string } | { kind: 'page'; page: DocumentInput }
export type ResolvePlacement<R extends { kind: string } = ResolvedPlacement> = (
  placement: PlacementValue,
  context: { purpose: 'screen' | 'print'; width?: number; signal: AbortSignal; day?: AsOfDay },
) => Promise<R | undefined>

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

export function placementMissingEntry(entry: Parameters<PlacementReport>[0]): PreflightEntry {
  const subject = entry.address ?? (entry.page === undefined ? 'unknown' : String(entry.page))
  return {
    check: 'placement-missing',
    subject,
    message: `Placement ${subject} is missing; supply a resolvable placement to clear it.`,
  }
}

export interface PlacementsOptions<R extends { kind: string } = ResolvedPlacement> {
  resolve: ResolvePlacement<R>
  report?: PlacementReport
}

type ResolvedMedia = Extract<ResolvedPlacement, { kind: 'media' }>
export type MediaAnswer =
  | { status: 'ok'; value: ResolvedMedia }
  | { status: 'missing' | 'refused-src'; message?: undefined }
  | { status: 'invalid'; message: string }
  | { status: 'failed'; message: string }

export function classifyMediaAnswer(input: { answer: { kind: string } | undefined }): Exclude<MediaAnswer, { status: 'failed' }>
export function classifyMediaAnswer(input: { error: unknown }): Extract<MediaAnswer, { status: 'failed' }>
export function classifyMediaAnswer(input: { answer: { kind: string } | undefined } | { error: unknown }): MediaAnswer {
  if ('error' in input) return { status: 'failed', message: input.error instanceof Error ? input.error.message : String(input.error) }
  const answer = input.answer
  if (!answer) return { status: 'missing' }
  if (answer.kind !== 'media' || !('src' in answer) || !('media' in answer)) {
    return { status: 'invalid', message: `resolved ${answer.kind}, not media` }
  }
  const media = answer as ResolvedMedia
  return safeImageSource(media.src) ? { status: 'ok', value: media } : { status: 'refused-src' }
}

export function placementCropEdges(crop: PlacementValue['crop']): string | undefined {
  if (!crop) return undefined
  return `${crop.top ?? 0} ${crop.right ?? 0} ${crop.bottom ?? 0} ${crop.left ?? 0}`
}

function positiveInteger(value: string | undefined): number | undefined {
  return value !== undefined && /^[1-9][0-9]*$/.test(value) ? Number(value) : undefined
}

function pageSelector(value: string | undefined): string | number | undefined {
  if (value === undefined) return undefined
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
  const address = element.attribs[MEDIA_ATTRIBUTE]
  const page = pageSelector(element.attribs[PAGE_ATTRIBUTE])
  try {
    const placement = Placement.parse(
      {
        kind: 'media',
        address: address as string,
        ...(page === undefined ? {} : { page }),
        ...(element.attribs[BOX_ATTRIBUTE] === undefined ? {} : { box: element.attribs[BOX_ATTRIBUTE] as PlacementValue['box'] }),
        ...(element.attribs[CROP_ATTRIBUTE] === undefined ? {} : { crop: cropValue(element.attribs[CROP_ATTRIBUTE]) }),
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

function planElements(found: Element[]): PlacementPlan {
  const planned = found.flatMap((element, index) =>
    element.name.toLowerCase() === 'img' && MEDIA_ATTRIBUTE in element.attribs ? [plannedElement(element, index)] : [],
  )
  return {
    entries: planned.filter((entry): entry is PlacementPlanEntry => 'placement' in entry),
    refusals: planned.filter((entry): entry is PlacementRefusal => !('placement' in entry)),
  }
}

export function placementPlan(html: string): PlacementPlan {
  return planElements(elements(parse(html).children))
}

export function placementPlaceholderSource(width = 400, height = 300): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#eee"/><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="#aaa"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function placeholder(element: Element): void {
  const authoredWidth = positiveInteger(element.attribs.width)
  const authoredHeight = positiveInteger(element.attribs.height)
  const width = authoredWidth ?? (authoredHeight === undefined ? 400 : Math.round((authoredHeight * 4) / 3))
  const height = authoredHeight ?? (authoredWidth === undefined ? 300 : Math.round((authoredWidth * 3) / 4))
  element.attribs.src = placementPlaceholderSource(width, height)
  element.attribs['data-segnavia-placement'] = 'missing'
  if (!('alt' in element.attribs)) element.attribs.alt = ''
  for (const attribute of PLACEMENT_ATTRIBUTES) delete element.attribs[attribute]
}

function applyResolved(element: Element, entry: PlacementPlanEntry, resolved: ResolvedMedia): void {
  element.attribs.src = resolved.src
  if (entry.alt === undefined && resolved.media.alt) {
    element.attribs.alt = resolved.media.alt.text
    if (entry.lang === undefined && entry.dir === undefined) {
      if (resolved.media.alt.lang) element.attribs.lang = resolved.media.alt.lang
      element.attribs.dir = mediaTextDirection(resolved.media.alt)
    }
  }
  const crop = placementCropEdges(entry.placement.crop)
  if (crop) {
    const declaration = `object-view-box: inset(${crop})`
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

export async function resolvePlacements<R extends { kind: string }>(
  html: string,
  options: {
    resolvePlacement: ResolvePlacement<R>
    purpose: 'screen' | 'print'
    width: number
    signal: AbortSignal
    day?: AsOfDay
    report?: PlacementReport
  },
): Promise<string> {
  const document = parse(html)
  const found = elements(document.children)
  const plan = planElements(found)
  if (plan.entries.length === 0 && plan.refusals.length === 0) return html
  options.signal.throwIfAborted()
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
              day: options.day,
            }),
          options.signal,
        )
        options.signal.throwIfAborted()
        const classified = classifyMediaAnswer({ answer: resolved })
        if (classified.status === 'ok') applyResolved(element, entry, classified.value)
        else {
          placeholder(element)
          options.report?.({
            address: entry.placement.address,
            page: entry.placement.page,
            reason: classified.status,
            ...(classified.message === undefined ? {} : { message: classified.message }),
          })
        }
      } catch (error) {
        if (options.signal.aborted) throw options.signal.reason
        const classified = classifyMediaAnswer({ error })
        placeholder(element)
        options.report?.({
          address: entry.placement.address,
          page: entry.placement.page,
          reason: classified.status,
          message: classified.message,
        })
      }
    }),
  )
  options.signal.throwIfAborted()
  return serialize(document)
}
