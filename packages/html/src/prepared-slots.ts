import type { SlotDeclaration, SlotFitState, SlotReport } from '@segnavia/format'

export interface PreparedSlots {
  declarations: SlotDeclaration[]
  report: SlotReport
  /** For each slot key, how many measurement groups marked it. Derived from frames for a prepared job. */
  marked: ReadonlyMap<string, number>
  /** The measurement marks owned by each frame, in application order. */
  frames: ReadonlyArray<ReadonlyMap<string, number>>
  apply(html: string): string
  mergeFit(slots: Record<string, SlotFitState>): SlotReport
}
