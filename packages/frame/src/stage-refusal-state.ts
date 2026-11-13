import type { Refusal } from '@segnavia/format'
import type { DeckState } from './controller-types.ts'
import { DeckRefusedError, SlideRefusedError } from './deck-refusal.ts'
import type { SlideFrameError } from './slide-frame-error.ts'
import { applicableStageRefusal, type StageRefusalRecord, type StageRefusalScope, stageRefusalRecord } from './stage-refusal.ts'

export function stageRefusalScope(refusal: Refusal): StageRefusalScope | null {
  if (refusal instanceof DeckRefusedError) return 'deck'
  if (refusal instanceof SlideRefusedError) return 'slide'
  return null
}

export class StageRefusalState {
  private record: StageRefusalRecord | null = null
  private shown: Refusal | null = null

  // A frame failure is a fact on the shown slide's frame, so the state reads it
  // when it recomputes rather than recording it.
  constructor(
    private host: HTMLElement,
    private shownFrameRefusal: (state: DeckState) => SlideFrameError | null = () => null,
  ) {}

  get refusal(): Refusal | null {
    return this.shown
  }

  arrive(refusal: Refusal, state: DeckState) {
    const scope = stageRefusalScope(refusal)
    if (!scope) return
    const candidate = stageRefusalRecord(refusal, scope, state)
    if (!applicableStageRefusal(candidate, state)) return
    this.record = candidate
    this.update(state)
  }

  update(state: DeckState | undefined) {
    if (!state) return
    const record = applicableStageRefusal(this.record, state)
    this.setShown(record?.refusal ?? this.shownFrameRefusal(state))
  }

  clear() {
    this.record = null
    this.setShown(null)
  }

  private setShown(refusal: Refusal | null) {
    const previous = this.refusal
    this.shown = refusal
    if (refusal) this.host.dataset.refused = refusal.code
    else delete this.host.dataset.refused
    if (refusal !== previous) this.host.dispatchEvent(new CustomEvent('refusalchange'))
  }
}
