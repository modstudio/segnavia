import type { DefineComponent } from 'vue'
import type {
  BoardChangeDetail,
  BoardErrorDetail,
  BoardItemActionDetail,
  BoardListToggleDetail,
  BoardOpenDetail,
  BoardShareDetail,
  BoardViewDetail,
} from './board-events.ts'
import type { BoardSearchErrorDetail, BoardSelectDetail } from './board-list.ts'
import type { BoardSelectionDetail } from './board-selection.ts'
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
import type { ELEMENT_PROPERTIES } from './element-properties.ts'
import type { FittedSize } from './fit.ts'
import type {
  SegnaviaBoard,
  SegnaviaBoardList,
  SegnaviaBoardToolbar,
  SegnaviaBook,
  SegnaviaDocument,
  SegnaviaPage,
  SegnaviaPaper,
  SegnaviaStage,
  SegnaviaThumbnail,
} from './index.ts'
import type { SegnaviaItemSettings } from './item-settings.ts'
import type { SegnaviaPlayer } from './player-entry.ts'
import type { StageFrameDetail } from './stage-frame-events.ts'
import type { Assert, EventProps } from './vue-types.ts'

type ElementClasses = {
  stage: SegnaviaStage
  thumbnail: SegnaviaThumbnail
  board: SegnaviaBoard
  boardList: SegnaviaBoardList
  boardToolbar: SegnaviaBoardToolbar
  page: SegnaviaPage
  paper: SegnaviaPaper
  document: SegnaviaDocument
  book: SegnaviaBook
  player: SegnaviaPlayer
  play: SegnaviaPlay
  step: SegnaviaStep
  track: SegnaviaTrack
  counter: SegnaviaCounter
  time: SegnaviaTime
  mute: SegnaviaMute
  captions: SegnaviaCaptions
  caption: SegnaviaCaption
  notes: SegnaviaNotes
  fullscreen: SegnaviaFullscreen
  rail: SegnaviaRail
  paperPicker: SegnaviaPaperPicker
  itemSettings: SegnaviaItemSettings
}

export interface FrameVueEventDetails {
  'segnavia-controller': unknown
  'segnavia-fit': FittedSize
  'segnavia-frame-mount': StageFrameDetail
  'segnavia-frame-release': StageFrameDetail
  'segnavia-thumbnail-error': unknown
  'segnavia-board-change': BoardChangeDetail
  'segnavia-board-error': BoardErrorDetail
  'segnavia-board-icons': unknown
  'segnavia-board-item-action': BoardItemActionDetail
  'segnavia-board-names': unknown
  'segnavia-board-open': BoardOpenDetail
  'segnavia-board-selection': BoardSelectionDetail
  'segnavia-board-view': BoardViewDetail
  'segnavia-board-search-error': BoardSearchErrorDetail
  'segnavia-board-select': BoardSelectDetail
  'segnavia-board-list-toggle': BoardListToggleDetail
  'segnavia-board-share': BoardShareDetail
  'segnavia-labels': unknown
  change: SegnaviaPaperPicker['value']
  'segnavia-fill-select': string
}

type Descriptor = (typeof ELEMENT_PROPERTIES)[keyof typeof ELEMENT_PROPERTIES]
type EventName = Descriptor['events'][number]
type _EveryPropertyExists = Assert<
  {
    [K in keyof typeof ELEMENT_PROPERTIES]: (typeof ELEMENT_PROPERTIES)[K]['properties'][number] extends keyof ElementClasses[K] ? true : false
  }[keyof typeof ELEMENT_PROPERTIES]
>
type _EveryEventHasDetail = Assert<EventName extends keyof FrameVueEventDetails ? true : false>
type _EveryDetailIsAnEvent = Assert<keyof FrameVueEventDetails extends EventName ? true : false>
type ComponentFor<K extends keyof typeof ELEMENT_PROPERTIES> = Partial<
  Pick<ElementClasses[K], Extract<(typeof ELEMENT_PROPERTIES)[K]['properties'][number], keyof ElementClasses[K]>>
> &
  EventProps<(typeof ELEMENT_PROPERTIES)[K]['events'], FrameVueEventDetails>
type FrameGlobalComponents = {
  [K in keyof typeof ELEMENT_PROPERTIES as (typeof ELEMENT_PROPERTIES)[K]['tag']]: DefineComponent<ComponentFor<K>>
}

declare module 'vue' {
  interface GlobalComponents extends FrameGlobalComponents {}
}
