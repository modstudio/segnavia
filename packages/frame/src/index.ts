// The headless browser entry point: the controller, <segnavia-stage> and
// <segnavia-page>, which bring no appearance of their own. The optional skin
// is a separate entry point (`@segnavia/frame/player`), so a host that draws
// its own controls never loads it. A server imports the pure entry points
// instead (`/bridge`, `/svg`, `/timeline`, `/print-document`).

import { SegnaviaPage } from './page.ts'
import { SegnaviaStage } from './stage.ts'

export { BASE_CSS } from './base-style.ts'
export { bridgeForHost, frameDocument, MESSAGE, RELAYED_KEYS } from './bridge.ts'
export { type ControllerOptions, DeckController, type DeckState } from './controller.ts'
export { type DeckAction, keyAction } from './keys.ts'
export { SegnaviaPage } from './page.ts'
export { printDeck, SLIDES_READY_DEADLINE_MS } from './print.ts'
export { printableDeck } from './print-document.ts'
export { SegnaviaStage } from './stage.ts'
export { momentAt, wordAt, wordIndex } from './timeline.ts'

if (!customElements.get('segnavia-stage')) customElements.define('segnavia-stage', SegnaviaStage)
if (!customElements.get('segnavia-page')) customElements.define('segnavia-page', SegnaviaPage)
