import type { SegnaviaBook, SegnaviaDocument, SegnaviaPage, SegnaviaPaper, SegnaviaStage, SegnaviaThumbnail } from '@segnavia/frame'
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
} from '@segnavia/frame/controls'
import { ELEMENT_PROPERTIES as FRAME_ELEMENTS } from '@segnavia/frame/element-properties'
import type { SegnaviaItemSettings } from '@segnavia/frame/item-settings'
import type { SegnaviaPlayer } from '@segnavia/frame/player'
import type {
  BookProps,
  CaptionProps,
  CaptionsProps,
  CounterProps,
  DocumentProps,
  FullscreenProps,
  ItemSettingsProps,
  MuteProps,
  NotesProps,
  PageProps,
  PaperPickerProps,
  PaperProps,
  PlayerProps,
  PlayProps,
  RailProps,
  StageProps,
  StepProps,
  ThumbnailProps,
  TimeProps,
  TrackProps,
} from './props.ts'

export interface RuntimeElementDescriptor {
  tag: `segnavia-${string}`
  properties: readonly string[]
  events: Readonly<Record<string, string>>
}

export interface ElementDescriptor<E extends object, P extends object, Tag extends `segnavia-${string}` = `segnavia-${string}`>
  extends RuntimeElementDescriptor {
  tag: Tag
  properties: readonly Extract<keyof P, string>[]
  events: Readonly<Record<string, Extract<keyof P, `on${string}`>>>
  readonly element?: E
  readonly props?: P
}

function element<E extends object, P extends object, Tag extends `segnavia-${string}`>(value: ElementDescriptor<E, P, Tag>): ElementDescriptor<E, P, Tag> {
  return value
}

export const ELEMENTS = {
  player: element<SegnaviaPlayer, PlayerProps, typeof FRAME_ELEMENTS.player.tag>(FRAME_ELEMENTS.player),
  stage: element<SegnaviaStage, StageProps, typeof FRAME_ELEMENTS.stage.tag>(FRAME_ELEMENTS.stage),
  thumbnail: element<SegnaviaThumbnail, ThumbnailProps, typeof FRAME_ELEMENTS.thumbnail.tag>(FRAME_ELEMENTS.thumbnail),
  paperPicker: element<SegnaviaPaperPicker, PaperPickerProps, typeof FRAME_ELEMENTS.paperPicker.tag>(FRAME_ELEMENTS.paperPicker),
  itemSettings: element<SegnaviaItemSettings, ItemSettingsProps, typeof FRAME_ELEMENTS.itemSettings.tag>(FRAME_ELEMENTS.itemSettings),
  page: element<SegnaviaPage, PageProps, typeof FRAME_ELEMENTS.page.tag>(FRAME_ELEMENTS.page),
  book: element<SegnaviaBook, BookProps, typeof FRAME_ELEMENTS.book.tag>(FRAME_ELEMENTS.book),
  paper: element<SegnaviaPaper, PaperProps, typeof FRAME_ELEMENTS.paper.tag>(FRAME_ELEMENTS.paper),
  document: element<SegnaviaDocument, DocumentProps, typeof FRAME_ELEMENTS.document.tag>(FRAME_ELEMENTS.document),
  play: element<SegnaviaPlay, PlayProps, typeof FRAME_ELEMENTS.play.tag>(FRAME_ELEMENTS.play),
  step: element<SegnaviaStep, StepProps, typeof FRAME_ELEMENTS.step.tag>(FRAME_ELEMENTS.step),
  track: element<SegnaviaTrack, TrackProps, typeof FRAME_ELEMENTS.track.tag>(FRAME_ELEMENTS.track),
  counter: element<SegnaviaCounter, CounterProps, typeof FRAME_ELEMENTS.counter.tag>(FRAME_ELEMENTS.counter),
  time: element<SegnaviaTime, TimeProps, typeof FRAME_ELEMENTS.time.tag>(FRAME_ELEMENTS.time),
  mute: element<SegnaviaMute, MuteProps, typeof FRAME_ELEMENTS.mute.tag>(FRAME_ELEMENTS.mute),
  captions: element<SegnaviaCaptions, CaptionsProps, typeof FRAME_ELEMENTS.captions.tag>(FRAME_ELEMENTS.captions),
  caption: element<SegnaviaCaption, CaptionProps, typeof FRAME_ELEMENTS.caption.tag>(FRAME_ELEMENTS.caption),
  notes: element<SegnaviaNotes, NotesProps, typeof FRAME_ELEMENTS.notes.tag>(FRAME_ELEMENTS.notes),
  fullscreen: element<SegnaviaFullscreen, FullscreenProps, typeof FRAME_ELEMENTS.fullscreen.tag>(FRAME_ELEMENTS.fullscreen),
  rail: element<SegnaviaRail, RailProps, typeof FRAME_ELEMENTS.rail.tag>(FRAME_ELEMENTS.rail),
} as const

export type AnyElementDescriptor = RuntimeElementDescriptor
export type ElementFor<D> = D extends ElementDescriptor<infer E, infer _P, infer _Tag> ? E : never
export type PropsFor<D> = D extends ElementDescriptor<infer _E, infer P, infer _Tag> ? P : never
