// The slim headless deck entry point registers the stage and thumbnail at load;
// a page thumbnail defines `<segnavia-page>` when it mounts one.

import { DeckController } from './controller.ts'
import { HEADLESS_ELEMENTS } from './deck-model.ts'
import { SegnaviaStage } from './stage.ts'
import { SegnaviaThumbnail } from './thumbnail.ts'

export {
  type ControllerOptions,
  type DeckState,
  formatTime,
  HEADLESS_ELEMENTS,
  type ResolvedContent,
  type SeekPolicy,
  type WatchedState,
} from './deck-model.ts'

export { DeckController, SegnaviaStage, SegnaviaThumbnail }

if (!customElements.get(HEADLESS_ELEMENTS.stage)) customElements.define(HEADLESS_ELEMENTS.stage, SegnaviaStage)
if (!customElements.get(HEADLESS_ELEMENTS.thumbnail)) customElements.define(HEADLESS_ELEMENTS.thumbnail, SegnaviaThumbnail)
