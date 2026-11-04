import type { Board, BoardItem } from '@segnavia/format'
import type { DefineComponent } from 'vue'
import type { BoardItemAction } from './board-actions.ts'
import type { BoardItemSearch } from './board-list.ts'
import type { ResolvedBoardItem } from './board-policy.ts'
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
  'segnavia-thumbnail-error': unknown
  'segnavia-board-change': { board: Board }
  'segnavia-board-error': { item?: ResolvedBoardItem; items?: readonly ResolvedBoardItem[]; error: unknown }
  'segnavia-board-icons': unknown
  'segnavia-board-item-action': { action: BoardItemAction; item: ResolvedBoardItem }
  'segnavia-board-names': unknown
  'segnavia-board-open': { item: ResolvedBoardItem }
  'segnavia-board-selection': { items: BoardItem[]; item: BoardItem | null }
  'segnavia-board-view': { view: SegnaviaBoard['view'] }
  'segnavia-board-search-error': { query: string; error: unknown }
  'segnavia-board-select': { item?: BoardItemSearch; section?: string }
  'segnavia-board-list-toggle': { open: boolean }
  'segnavia-board-share': { board: Board | null }
  'segnavia-labels': unknown
  change: SegnaviaPaperPicker['value']
  'segnavia-fill-select': string
}

type Descriptor = (typeof ELEMENT_PROPERTIES)[keyof typeof ELEMENT_PROPERTIES]
type EventName = Descriptor['events'][number]
type Assert<T extends true> = T
type _EveryPropertyExists = Assert<
  {
    [K in keyof typeof ELEMENT_PROPERTIES]: (typeof ELEMENT_PROPERTIES)[K]['properties'][number] extends keyof ElementClasses[K] ? true : false
  }[keyof typeof ELEMENT_PROPERTIES]
>
type _EveryEventHasDetail = Assert<EventName extends keyof FrameVueEventDetails ? true : false>
type CamelEvent<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Capitalize<Head>}${CamelEvent<Tail>}` : Capitalize<S>
type EventProps<Events extends readonly EventName[]> = {
  [E in Events[number] as `on${CamelEvent<E>}`]?: (event: CustomEvent<FrameVueEventDetails[E]>) => void
}
type ComponentFor<K extends keyof typeof ELEMENT_PROPERTIES> = Partial<
  Pick<ElementClasses[K], Extract<(typeof ELEMENT_PROPERTIES)[K]['properties'][number], keyof ElementClasses[K]>>
> &
  EventProps<(typeof ELEMENT_PROPERTIES)[K]['events']>
type FrameGlobalComponents = {
  [K in keyof typeof ELEMENT_PROPERTIES as (typeof ELEMENT_PROPERTIES)[K]['tag']]: DefineComponent<ComponentFor<K>>
}

declare module 'vue' {
  interface GlobalComponents extends FrameGlobalComponents {}
}
