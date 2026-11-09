import { type AnchorSource, type AsOf, type AsOfDay, type Page, resolveDocumentDay, type SlotsOptions, type Zone } from '@segnavia/format'
import { slotsForDay } from './day-slots.ts'

export interface EstablishedPageDay {
  day: AsOfDay
  slots: SlotsOptions
}

export interface DocumentDayContexts {
  pages: EstablishedPageDay[]
  days: AsOfDay[]
}

export interface DocumentDayContextOptions {
  moment: number
  hostZone?: Zone
  anchors?: AnchorSource
  slots?: SlotsOptions
  signal: AbortSignal
}

function asOfKey(asOf: AsOf | undefined): string {
  if (!asOf) return JSON.stringify(['absent'])
  if (asOf.kind === 'fixed') return JSON.stringify([asOf.kind, asOf.date, asOf.zone])
  if (asOf.kind === 'anchor') return JSON.stringify([asOf.kind, asOf.anchor, asOf.zone])
  return JSON.stringify([asOf.kind, asOf.zone])
}

function dayKey(day: AsOfDay): string {
  return JSON.stringify([day.date, day.zone, day.kind, day.anchor])
}

export async function resolveDocumentDayContexts(pages: readonly Page[], options: DocumentDayContextOptions): Promise<DocumentDayContexts> {
  const resolutions = new Map<string, Promise<AsOfDay>>()
  const resolvedDays = await Promise.all(
    pages.map((page) => {
      const key = asOfKey(page.asOf)
      const existing = resolutions.get(key)
      if (existing) return existing
      const resolution = resolveDocumentDay(page.asOf, options)
      resolutions.set(key, resolution)
      return resolution
    }),
  )
  options.signal.throwIfAborted()

  const slots = new Map<string, Promise<SlotsOptions>>()
  const established = await Promise.all(
    resolvedDays.map(async (day) => {
      const key = dayKey(day)
      let resolution = slots.get(key)
      if (!resolution) {
        resolution = slotsForDay(options.slots, day, options.signal)
        slots.set(key, resolution)
      }
      return { day, slots: await resolution }
    }),
  )
  options.signal.throwIfAborted()

  const days = [...new Map(resolvedDays.map((day) => [dayKey(day), day])).values()]
  return { pages: established, days }
}
