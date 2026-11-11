import type { AsOf, AsOfDay, CalendarDate as CalendarDateValue, Zone } from './as-of.ts'
import { CalendarDate } from './as-of.ts'
import { AsOfRefusedError, type AsOfResolution, asOfRefusal, resolveAsOfDay } from './as-of-policy.ts'

export interface AnchorSource {
  choices: readonly { name: string; label: string | Readonly<Record<string, string>> }[]
  resolve(
    name: string,
    context: { moment: number; today: CalendarDateValue; zone: Zone; signal: AbortSignal },
  ): CalendarDateValue | null | Promise<CalendarDateValue | null>
}

export interface DocumentDayOptions {
  moment: number
  hostMoment?: number
  hostZone?: Zone
  anchors?: AnchorSource
  signal: AbortSignal
}

function refused(anchor: string, reason: string): AsOfRefusedError {
  return new AsOfRefusedError(asOfRefusal(anchor, reason))
}

export async function resolveDocumentDay(asOf: AsOf | undefined, options: DocumentDayOptions): Promise<AsOfDay> {
  options.signal.throwIfAborted()
  return resolveDocumentDayResult(resolveAsOfDay(asOf, options), options)
}

/** Completes an already-evaluated as-of policy without evaluating that policy a second time. */
export async function resolveDocumentDayResult(resolution: AsOfResolution, options: DocumentDayOptions): Promise<AsOfDay> {
  options.signal.throwIfAborted()
  if (resolution.kind === 'day') return resolution.day
  const { anchor, today, zone, moment } = resolution
  if (!options.anchors) {
    throw refused(anchor, `the day asked from was ${today} in ${zone}, but no anchor source was registered; register an anchor source that offers it`)
  }
  const offered = options.anchors.choices.map((choice) => choice.name)
  if (!offered.includes(anchor)) {
    const names = offered.length === 0 ? 'none' : offered.map((name) => JSON.stringify(name)).join(', ')
    throw refused(anchor, `the day asked from was ${today} in ${zone}, but that name is not offered; choose one of ${names}`)
  }
  const answer = await options.anchors.resolve(anchor, { moment: options.moment, today, zone, signal: options.signal })
  options.signal.throwIfAborted()
  if (answer === null) {
    throw refused(anchor, `the day asked from was ${today} in ${zone}, but the host's anchor source returned no date; make the source return a calendar date`)
  }
  const parsed = CalendarDate.safeParse(answer)
  if (!parsed.success) {
    throw refused(
      anchor,
      `the day asked from was ${today} in ${zone}, but the host's anchor source returned an invalid date; make the source return a YYYY-MM-DD calendar date`,
    )
  }
  return { date: parsed.data, zone, kind: 'anchor', anchor, ...(moment === undefined ? {} : { moment }) }
}
