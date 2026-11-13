import type { AsOfDay, ComposeProgress, PreflightReport } from '@segnavia/format'
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
import type { FontFailureDetail } from './bridge-message.ts'
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
  SegnaviaPrintedPages,
  SegnaviaStage,
  SegnaviaThumbnail,
} from './index.ts'
import type { SegnaviaItemSettings } from './item-settings.ts'
import type { SegnaviaPlayer } from './player-entry.ts'
import type { StageFrameDetail } from './stage-frame-events.ts'
import type { Assert, ElementPropertyWrites, EventProps, NativeEvent, PlainEvent } from './vue-types.ts'

type ElementClasses = {
  stage: SegnaviaStage
  thumbnail: SegnaviaThumbnail
  board: SegnaviaBoard
  boardList: SegnaviaBoardList
  boardToolbar: SegnaviaBoardToolbar
  page: SegnaviaPage
  printedPages: SegnaviaPrintedPages
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
  asof: AsOfDay
  fontfailure: FontFailureDetail
  preflight: PreflightReport
  ready: PlainEvent
  error: NativeEvent<ErrorEvent>
  composeprogress: ComposeProgress
  page: { page: number; pageCount: number }
  record: { record: string | undefined }
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
  'segnavia-fill-input': SegnaviaItemSettings['fills'][number]
}

export interface FrameVueElementEventDetails {
  paper: { change: PlainEvent }
  document: {
    'segnavia-document-slots': null
    'segnavia-document-page': { index: number }
    'segnavia-document-change': null
  }
}

type Descriptor = (typeof ELEMENT_PROPERTIES)[keyof typeof ELEMENT_PROPERTIES]
type EventName = Descriptor['events'][number]
type OverrideEventName = {
  [K in keyof FrameVueElementEventDetails]: keyof FrameVueElementEventDetails[K]
}[keyof FrameVueElementEventDetails]
type EventDetailsFor<K extends keyof typeof ELEMENT_PROPERTIES> = K extends keyof FrameVueElementEventDetails
  ? Omit<FrameVueEventDetails, keyof FrameVueElementEventDetails[K]> & FrameVueElementEventDetails[K]
  : FrameVueEventDetails
type _EveryPropertyExists = Assert<
  {
    [K in keyof typeof ELEMENT_PROPERTIES]: (typeof ELEMENT_PROPERTIES)[K]['properties'][number] extends keyof ElementClasses[K] ? true : false
  }[keyof typeof ELEMENT_PROPERTIES]
>
type _EveryWritePropertyExists = Assert<
  {
    [K in keyof ElementPropertyWrites]: keyof ElementPropertyWrites[K] extends (typeof ELEMENT_PROPERTIES)[K]['properties'][number] ? true : false
  }[keyof ElementPropertyWrites]
>
type _EveryEventHasDetail = Assert<EventName extends keyof FrameVueEventDetails | OverrideEventName ? true : false>
type _EveryDetailIsAnEvent = Assert<keyof FrameVueEventDetails extends EventName ? true : false>
type _EveryOverrideIsAnEvent = Assert<
  {
    [K in keyof FrameVueElementEventDetails]: keyof FrameVueElementEventDetails[K] extends (typeof ELEMENT_PROPERTIES)[K]['events'][number] ? true : false
  }[keyof FrameVueElementEventDetails]
>
type ComponentProperty<K extends keyof typeof ELEMENT_PROPERTIES, P extends keyof ElementClasses[K]> = K extends keyof ElementPropertyWrites
  ? P extends keyof ElementPropertyWrites[K]
    ? ElementPropertyWrites[K][P]
    : ElementClasses[K][P]
  : ElementClasses[K][P]
type ComponentFor<K extends keyof typeof ELEMENT_PROPERTIES> = Partial<{
  [P in Extract<(typeof ELEMENT_PROPERTIES)[K]['properties'][number], keyof ElementClasses[K]>]: ComponentProperty<K, P>
}> &
  EventProps<(typeof ELEMENT_PROPERTIES)[K]['events'], EventDetailsFor<K> & Record<(typeof ELEMENT_PROPERTIES)[K]['events'][number], unknown>>
type _BookErrorIsNative = Assert<Parameters<NonNullable<ComponentFor<'book'>['onError']>>[0] extends ErrorEvent ? true : false>
type BookReadyEvent = Parameters<NonNullable<ComponentFor<'book'>['onReady']>>[0]
type _BookReadyIsNative = Assert<[BookReadyEvent] extends [Event] ? ([Event] extends [BookReadyEvent] ? true : false) : false>
type PaperChangeEvent = Parameters<NonNullable<ComponentFor<'paper'>['onChange']>>[0]
type _PaperChangeIsNative = Assert<[PaperChangeEvent] extends [Event] ? ([Event] extends [PaperChangeEvent] ? true : false) : false>
type FrameGlobalComponents = {
  [K in keyof typeof ELEMENT_PROPERTIES as (typeof ELEMENT_PROPERTIES)[K]['tag']]: DefineComponent<ComponentFor<K>>
}

declare module 'vue' {
  interface GlobalComponents extends FrameGlobalComponents {}
}
