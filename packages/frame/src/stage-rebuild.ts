import type { DeckController, DeckState } from './controller.ts'
import type { FramePool } from './frame-pool.ts'

export type StageRebuildAction = 'refresh' | 'update'

export function stageRebuildAction(controllerUnchanged: boolean, shownFrameMounted: boolean, resolvesSlides: boolean): StageRebuildAction {
  return controllerUnchanged && shownFrameMounted && resolvesSlides ? 'refresh' : 'update'
}

export class StageFrameRebuilder {
  private generation = 0

  constructor(
    private pool: Pick<FramePool, 'clear' | 'hasMountedFrame'>,
    private attached: () => DeckController | null,
    private connected: () => boolean,
    private update: (state: DeckState) => void,
  ) {}

  rebuild(controller: DeckController | null, controllerUnchanged: boolean) {
    const generation = ++this.generation
    const slideId = controller?.state.slide?.id
    const shownFrameMounted = Boolean(slideId && this.pool.hasMountedFrame(slideId))
    const action = stageRebuildAction(controllerUnchanged, shownFrameMounted, Boolean(controller?.resolveSlide))
    this.pool.clear()
    if (!controller?.state.deck) return
    if (action === 'update') {
      this.update(controller.state)
      return
    }
    void controller.refreshContent().then((result) => {
      if (result === 'superseded' || generation !== this.generation || !this.connected() || this.attached() !== controller) return
      this.update(controller.state)
    })
  }
}
