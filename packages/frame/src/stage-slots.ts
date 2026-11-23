import type { Deck, SlotsOptions } from '@segnavia/format'
import type { captureAsOfLoad } from './as-of-element.ts'
import { EMPTY_SLOTS, type PreparedSlots, slotFillRefusal } from './slot-render.ts'
import { prepareStageDay, stageDayChangesFrames } from './stage-day.ts'

interface SlotResolution {
  deck: Deck
  controller: AbortController
  resolved: PreparedSlots
}
const resolutions = new WeakMap<object, SlotResolution>()

export function resetStageSlots(host: object): void {
  resolutions.get(host)?.controller.abort()
  resolutions.delete(host)
}

export function stageSlots(
  host: object,
  deck: Deck,
  inputs: ReturnType<typeof captureAsOfLoad>,
  options: SlotsOptions | undefined,
  current: () => boolean,
  refused: (error: Error) => void,
  established: (day: Awaited<ReturnType<typeof prepareStageDay>>['established']['day'], rebuild: boolean) => void,
  failed: (error: unknown, rebuild: boolean) => void,
): PreparedSlots {
  const existing = resolutions.get(host)
  if (existing?.deck === deck) return existing.resolved
  existing?.controller.abort()
  const controller = new AbortController()
  const state = { deck, controller, resolved: EMPTY_SLOTS }
  resolutions.set(host, state)
  const refusal = slotFillRefusal(deck.scripts, deck.slots, options)
  const rebuild = stageDayChangesFrames(deck, options, refusal !== undefined)
  if (refusal) refused(refusal)
  void prepareStageDay(deck, inputs, refusal ? undefined : deck.slots, refusal ? undefined : options, controller.signal).then(
    (prepared) => {
      if (!current() || controller.signal.aborted || resolutions.get(host) !== state) return
      state.resolved = prepared.resolved
      established(prepared.established.day, rebuild)
    },
    (error) => {
      if (!current() || controller.signal.aborted || resolutions.get(host) !== state) return
      state.resolved = EMPTY_SLOTS
      failed(error, rebuild)
    },
  )
  return state.resolved
}
