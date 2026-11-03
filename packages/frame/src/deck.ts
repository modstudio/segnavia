// The slim headless deck entry point registers the stage and thumbnail at load;
// a page thumbnail defines `<segnavia-page>` when it mounts one.

import { formatTime } from './control-values.ts'
import { type ControllerOptions, DeckController, type DeckState, type ResolvedContent } from './controller.ts'
import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { SegnaviaStage } from './stage.ts'
import { SegnaviaThumbnail } from './thumbnail.ts'

export { type ControllerOptions, DeckController, type DeckState, formatTime, HEADLESS_ELEMENTS, type ResolvedContent, SegnaviaStage, SegnaviaThumbnail }

if (!customElements.get(HEADLESS_ELEMENTS.stage)) customElements.define(HEADLESS_ELEMENTS.stage, SegnaviaStage)
if (!customElements.get(HEADLESS_ELEMENTS.thumbnail)) customElements.define(HEADLESS_ELEMENTS.thumbnail, SegnaviaThumbnail)
