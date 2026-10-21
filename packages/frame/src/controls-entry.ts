// The styled components' entry point: defines each finished piece, and the
// headless elements they connect to. A host places them beside its own UI.

import './index.ts'
import { SegnaviaCaption, SegnaviaNotes } from './caption.ts'
import { SegnaviaCaptions, SegnaviaCounter, SegnaviaFullscreen, SegnaviaMute, SegnaviaPlay, SegnaviaStep, SegnaviaTime, SegnaviaTrack } from './controls.ts'
import { SegnaviaPaperPicker } from './paper-picker.ts'
import { SegnaviaRail } from './rail.ts'
import { STYLED_ELEMENTS } from './styled-elements.ts'

export { SegnaviaCaption, SegnaviaNotes } from './caption.ts'
export { SegnaviaControl } from './control.ts'
export { captionsControlVisible, deckHasNarration, formatTime, timeValues } from './control-values.ts'
export { SegnaviaCaptions, SegnaviaCounter, SegnaviaFullscreen, SegnaviaMute, SegnaviaPlay, SegnaviaStep, SegnaviaTime, SegnaviaTrack } from './controls.ts'
export { TOKENS_CSS } from './controls-style.ts'
export { ICONS } from './icons.ts'
export * from './index.ts'
export { ENGLISH_LABELS, type PlayerLabels } from './labels.ts'
export { ENGLISH_PAPER_PICKER_LABELS, type PaperPickerLabelOverrides, type PaperPickerLabels, SegnaviaPaperPicker } from './paper-picker.ts'
export { SegnaviaRail } from './rail.ts'
export { STYLED_ELEMENT_NAMES, STYLED_ELEMENTS } from './styled-elements.ts'
export { trackMsAt } from './track-mapping.ts'

const COMPONENTS: Array<[string, CustomElementConstructor]> = [
  [STYLED_ELEMENTS.play, SegnaviaPlay],
  [STYLED_ELEMENTS.step, SegnaviaStep],
  [STYLED_ELEMENTS.counter, SegnaviaCounter],
  [STYLED_ELEMENTS.fullscreen, SegnaviaFullscreen],
  [STYLED_ELEMENTS.track, SegnaviaTrack],
  [STYLED_ELEMENTS.rail, SegnaviaRail],
  [STYLED_ELEMENTS.time, SegnaviaTime],
  [STYLED_ELEMENTS.mute, SegnaviaMute],
  [STYLED_ELEMENTS.captions, SegnaviaCaptions],
  [STYLED_ELEMENTS.caption, SegnaviaCaption],
  [STYLED_ELEMENTS.notes, SegnaviaNotes],
  [STYLED_ELEMENTS.paperPicker, SegnaviaPaperPicker],
]
for (const [name, component] of COMPONENTS) if (!customElements.get(name)) customElements.define(name, component)
