import {
  AS_OF_ANCHOR_PATH,
  AS_OF_CONTEXT,
  AS_OF_DATE_PATH,
  AS_OF_ZONE_PATH,
  type AsOfDay,
  type FillValues,
  type SlotDeclarationInput,
  type SlotsOptions,
} from '@segnavia/format'
import { bindingRoot } from '@segnavia/html'

const declarations: SlotDeclarationInput[] = [
  { key: AS_OF_DATE_PATH, label: 'As-of date', type: 'text' },
  { key: AS_OF_ZONE_PATH, label: 'As-of zone', type: 'text' },
  { key: AS_OF_ANCHOR_PATH, label: 'As-of anchor', type: 'text' },
]

function collision(options: SlotsOptions | undefined): string | undefined {
  const declared = options?.declarations?.find((slot) => bindingRoot(slot.key) === AS_OF_CONTEXT)?.key
  if (declared) return declared
  for (const values of [options?.overrides, options?.fill?.values, options?.source?.values]) {
    const key = Object.keys(values ?? {}).find((held) => bindingRoot(held) === AS_OF_CONTEXT)
    if (key) return key
  }
  return undefined
}

export function asOfValues(day: AsOfDay): FillValues {
  return {
    [AS_OF_DATE_PATH]: day.date,
    [AS_OF_ZONE_PATH]: day.zone,
    ...(day.anchor === undefined ? {} : { [AS_OF_ANCHOR_PATH]: day.anchor }),
  }
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
  const values = asOfValues(day)
  return {
    ...options,
    resolve: undefined,
    source,
    ...(bindDay
      ? {
          declarations: [...(options?.declarations ?? []), ...declarations],
          overrides: { ...(options?.overrides ?? {}), ...values },
        }
      : {}),
  }
}

export async function slotsForDay(options: SlotsOptions | undefined, day: AsOfDay, signal: AbortSignal, bindDay = false): Promise<SlotsOptions> {
  const resolved = options?.resolve ? await options.resolve({ day, signal }) : options?.source
  signal.throwIfAborted()
  return slotsWithDay(options, day, resolved, bindDay)
}
