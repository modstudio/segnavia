// The headless browser entry point: the controller, <segnavia-stage> and
// <segnavia-page> and <segnavia-paper>, which bring no appearance of their own. The optional skin
// is a separate entry point (`@segnavia/frame/player`), so a host that draws
// its own controls never loads it. A server imports the pure entry points
// instead (`/bridge`, `/svg`, `/timeline`, `/print-document`).

import { SegnaviaPage } from './page.ts'
import { SegnaviaPaper } from './paper.ts'
import { SegnaviaStage } from './stage.ts'

export { BASE_CSS } from './base-style.ts'
export { bridgeForHost, frameDocument, MESSAGE, RELAYED_KEYS } from './bridge.ts'
export { type ControllerOptions, DeckController, type DeckState, type ResolvedContent } from './controller.ts'
export { type FitInputs, type FittedSize, fitSheet } from './fit.ts'
export { defaultFrameTitle, type FrameTitle } from './frame-title.ts'
export { type DeckAction, keyAction } from './keys.ts'
export { SegnaviaPage } from './page.ts'
export { SegnaviaPaper } from './paper.ts'
export { type BrowserPagesPrintOptions, type BrowserPrintOptions, type PrintDialogOptions, printDeck, printPages, SLIDES_READY_DEADLINE_MS } from './print.ts'
export { htmlSlideDocument, notesLayoutGeometry, printableDeck, printablePaper } from './print-document.ts'
export { SegnaviaStage, type StageReserve } from './stage.ts'
export { deckTimeline, momentAt, slideDurationMs, slideStateAt, wordAt, wordIndex } from './timeline.ts'
export { type HostTransition, type TransitionAxis, type TurnDirection, type TurnTransition, transitionFor } from './transition.ts'

if (!customElements.get('segnavia-stage')) customElements.define('segnavia-stage', SegnaviaStage)
if (!customElements.get('segnavia-page')) customElements.define('segnavia-page', SegnaviaPage)
if (!customElements.get('segnavia-paper')) customElements.define('segnavia-paper', SegnaviaPaper)
