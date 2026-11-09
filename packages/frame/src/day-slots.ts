import type { AsOfDay, FillValues, SlotDeclarationInput, SlotsOptions } from '@segnavia/format'

const ROOT = 'asOf'
const declarations: SlotDeclarationInput[] = [
  { key: 'asOf.date', label: 'As-of date', type: 'text' },
  { key: 'asOf.zone', label: 'As-of zone', type: 'text' },
  { key: 'asOf.anchor', label: 'As-of anchor', type: 'text' },
]

const root = (key: string) => key.split('.')[0]

function collision(options: SlotsOptions | undefined): string | undefined {
  const declared = options?.declarations?.find((slot) => root(slot.key) === ROOT)?.key
  if (declared) return declared
  for (const values of [options?.overrides, options?.fill?.values, options?.source?.values]) {
    const key = Object.keys(values ?? {}).find((held) => root(held) === ROOT)
    if (key) return key
  }
  return undefined
}

export function slotsOptionsRefusal(options: SlotsOptions | undefined): Error | undefined {
  if (options?.source && options.resolve) {
    return new RangeError('slots.source and slots.resolve were both supplied; remove one of those options to clear this refusal.')
  }
  const key = collision(options)
  return key
    ? new RangeError(`The host slot ${JSON.stringify(key)} claims the reserved asOf context; remove asOf from the slots options to clear this refusal.`)
    : undefined
}

export function slotsWithDay(options: SlotsOptions | undefined, day: AsOfDay, source: SlotsOptions['source'], bindDay = false): SlotsOptions {
  const refusal = slotsOptionsRefusal(options)
  if (refusal) throw refusal
  const values: FillValues = {
    'asOf.date': day.date,
    'asOf.zone': day.zone,
    ...(day.anchor === undefined ? {} : { 'asOf.anchor': day.anchor }),
  }
  return {
    ...options,
    resolve: undefined,
    source,
    declarations: [...(options?.declarations ?? []), ...(bindDay ? declarations : [])],
    overrides: { ...(options?.overrides ?? {}), ...(bindDay ? values : {}) },
  }
}

export async function slotsForDay(options: SlotsOptions | undefined, day: AsOfDay, signal: AbortSignal, bindDay = false): Promise<SlotsOptions> {
  const refusal = slotsOptionsRefusal(options)
  if (refusal) throw refusal
  const resolved = options?.resolve ? await options.resolve({ day, signal }) : options?.source
  signal.throwIfAborted()
  return slotsWithDay(options, day, resolved, bindDay)
}
