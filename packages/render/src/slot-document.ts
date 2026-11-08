import type { PreparedSlots } from '@segnavia/html'

/** A live view of shared slot state for the frame groups measured by one rendered document. */
export function slotsForDocument(slots: PreparedSlots, groups: ReadonlyArray<readonly number[]>): PreparedSlots {
  const marked = new Map<string, number>()
  for (const group of groups) {
    const keys = new Set(group.flatMap((index) => [...(slots.frames[index]?.keys() ?? [])]))
    for (const key of keys) marked.set(key, (marked.get(key) ?? 0) + 1)
  }
  return {
    declarations: slots.declarations,
    get report() {
      return slots.report
    },
    marked,
    frames: groups.flatMap((group) => group.flatMap((index) => (slots.frames[index] ? [slots.frames[index]] : []))),
    apply: slots.apply,
    mergeFit: slots.mergeFit,
  }
}
