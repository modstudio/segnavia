// The headless browser entry point: the controller and the stage, page, paper
// and book elements, which bring no appearance of their own. The optional
// skin is a separate entry point (`@segnavia/frame/player`), so a host that
// draws its own controls never loads it. A server imports the pure entry
// points instead (`/bridge`, `/svg`, `/timeline`, `/print-document`).

import { SegnaviaBoard } from './board.ts'
import { SegnaviaBoardList } from './board-list.ts'
import { SegnaviaBoardToolbar } from './board-toolbar.ts'
import { SegnaviaBook } from './book.ts'
import { SegnaviaDocument } from './document.ts'
import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { SegnaviaPage } from './page.ts'
import { SegnaviaPaper } from './paper.ts'
import { SegnaviaStage } from './stage.ts'
import { SegnaviaThumbnail } from './thumbnail.ts'

export type { PageInput, PrintInput } from '@segnavia/format'
export { BASE_CSS } from './base-style.ts'
export { SegnaviaBoard } from './board.ts'
export type { BoardItemAction, BoardItemKind } from './board-actions.ts'
export { type BoardItemSearch, type BoardListLabels, SegnaviaBoardList } from './board-list.ts'
export type { BoardItemNames } from './board-names.ts'
export type { ResolvedBoardItem } from './board-policy.ts'
export { boardTier, keyToView, provisionalShape, resolvedShape, shouldMountItem } from './board-policy.ts'
export type { ResolveBoardItem } from './board-resolutions.ts'
export { type BoardToolbarLabels, SegnaviaBoardToolbar } from './board-toolbar.ts'
export { SegnaviaBook } from './book.ts'
export { bridgeForHost, frameDocument, MESSAGE, RELAYED_KEYS } from './bridge.ts'
export { type ControllerOptions, DeckController, type DeckState, type ResolvedContent } from './controller.ts'
export { SegnaviaDocument } from './document.ts'
export { type FitInputs, type FittedSize, fitSheet } from './fit.ts'
export { defaultFrameTitle, type FrameTitle } from './frame-title.ts'
export { HEADLESS_ELEMENT_NAMES, HEADLESS_ELEMENTS } from './headless-elements.ts'
export { type DeckAction, keyAction } from './keys.ts'
export type { BoardLabels } from './labels.ts'
export type { MotifsOptions } from './motif-expansion.ts'
export { type PageSelection, SELECTION_REPLY_MS, SegnaviaPage } from './page.ts'
export { FontRefusedError, type FontsOptions } from './page-fonts.ts'
export { SegnaviaPaper } from './paper.ts'
export { type BrowserPagesPrintOptions, type BrowserPrintOptions, type PrintDialogOptions, printDeck, printPages, SLIDES_READY_DEADLINE_MS } from './print.ts'
export { htmlSlideDocument, notesLayoutGeometry, printableDeck, printablePaper } from './print-document.ts'
export { SegnaviaStage, type StageReserve } from './stage.ts'
export { STYLED_ELEMENT_NAMES, STYLED_ELEMENTS } from './styled-elements.ts'
export { SegnaviaThumbnail } from './thumbnail.ts'
export { deckTimeline, momentAt, phaseBounds, positionAt, slideDurationMs, slideStateAt, wordAt, wordIndex } from './timeline.ts'
export { type HostTransition, type TransitionAxis, type TurnDirection, type TurnTransition, transitionFor } from './transition.ts'

if (!customElements.get(HEADLESS_ELEMENTS.stage)) customElements.define(HEADLESS_ELEMENTS.stage, SegnaviaStage)
if (!customElements.get(HEADLESS_ELEMENTS.board)) customElements.define(HEADLESS_ELEMENTS.board, SegnaviaBoard)
if (!customElements.get(HEADLESS_ELEMENTS.boardList)) customElements.define(HEADLESS_ELEMENTS.boardList, SegnaviaBoardList)
if (!customElements.get(HEADLESS_ELEMENTS.boardToolbar)) customElements.define(HEADLESS_ELEMENTS.boardToolbar, SegnaviaBoardToolbar)
if (!customElements.get(HEADLESS_ELEMENTS.thumbnail)) customElements.define(HEADLESS_ELEMENTS.thumbnail, SegnaviaThumbnail)
if (!customElements.get(HEADLESS_ELEMENTS.page)) customElements.define(HEADLESS_ELEMENTS.page, SegnaviaPage)
if (!customElements.get(HEADLESS_ELEMENTS.paper)) customElements.define(HEADLESS_ELEMENTS.paper, SegnaviaPaper)
if (!customElements.get(HEADLESS_ELEMENTS.document)) customElements.define(HEADLESS_ELEMENTS.document, SegnaviaDocument)
if (!customElements.get(HEADLESS_ELEMENTS.book)) customElements.define(HEADLESS_ELEMENTS.book, SegnaviaBook)
