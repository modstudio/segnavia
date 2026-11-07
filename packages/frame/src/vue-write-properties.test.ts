import { expect, test } from 'bun:test'
import type {
  SegnaviaCaption,
  SegnaviaCaptions,
  SegnaviaCounter,
  SegnaviaFullscreen,
  SegnaviaMute,
  SegnaviaNotes,
  SegnaviaPaperPicker,
  SegnaviaPlay,
  SegnaviaRail,
  SegnaviaStep,
  SegnaviaTime,
  SegnaviaTrack,
} from './controls-entry.ts'
import type { SegnaviaBoard, SegnaviaBook, SegnaviaDocument, SegnaviaPage, SegnaviaStage, SegnaviaThumbnail } from './index.ts'
import type { SegnaviaItemSettings } from './item-settings.ts'
import type { SegnaviaPlayer } from './player-entry.ts'
import type { ElementPropertyWrites } from './vue-types.ts'

type Control =
  | SegnaviaPlay
  | SegnaviaStep
  | SegnaviaTrack
  | SegnaviaCounter
  | SegnaviaTime
  | SegnaviaMute
  | SegnaviaCaptions
  | SegnaviaCaption
  | SegnaviaNotes
  | SegnaviaFullscreen
  | SegnaviaRail

function assignDeclaredWrites(
  elements: {
    stage: SegnaviaStage
    thumbnail: SegnaviaThumbnail
    board: SegnaviaBoard
    page: SegnaviaPage
    document: SegnaviaDocument
    book: SegnaviaBook
    player: SegnaviaPlayer
    control: Control
    paperPicker: SegnaviaPaperPicker
    itemSettings: SegnaviaItemSettings
  },
  writes: ElementPropertyWrites,
): void {
  elements.stage.transition = writes.stage.transition
  elements.thumbnail.deck = writes.thumbnail.deck
  elements.thumbnail.page = writes.thumbnail.page
  elements.thumbnail.print = writes.thumbnail.print
  elements.board.board = writes.board.board
  elements.page.page = writes.page.page
  elements.document.pages = writes.document.pages
  elements.document.print = writes.document.print
  elements.book.view = writes.book.view
  elements.player.labels = writes.player.labels
  elements.player.transition = writes.player.transition
  elements.control.labels = writes.play.labels
  elements.paperPicker.value = writes.paperPicker.value
  elements.paperPicker.labels = writes.paperPicker.labels
  elements.itemSettings.declarations = writes.itemSettings.declarations
  elements.itemSettings.fills = writes.itemSettings.fills
  elements.itemSettings.fill = writes.itemSettings.fill
  elements.itemSettings.source = writes.itemSettings.source
  elements.itemSettings.report = writes.itemSettings.report
  elements.itemSettings.labels = writes.itemSettings.labels
}

test('Vue write types stay assignable to their element setters', () => {
  expect(assignDeclaredWrites).toBeFunction()
})
