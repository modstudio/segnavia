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
  events: Readonly<Partial<Record<string, string>>>
}

export interface ElementDescriptor<E extends object, P extends object, Tag extends `segnavia-${string}` = `segnavia-${string}`>
  extends RuntimeElementDescriptor {
  tag: Tag
  properties: readonly Extract<keyof P, string>[]
  events: Readonly<Partial<Record<Extract<keyof P, `on${string}`>, string>>>
  readonly element?: E
  readonly props?: P
}

export function invertEvents<ReactEvent extends `on${string}`>(events: Readonly<Record<string, ReactEvent>>): Readonly<Partial<Record<ReactEvent, string>>> {
  return Object.fromEntries(Object.entries(events).map(([event, reactEvent]) => [reactEvent, event])) as Partial<Record<ReactEvent, string>>
}

const reactEvents =
  <P extends object>() =>
  <Events extends readonly string[]>(
    _events: Events,
    names: Readonly<Record<Events[number], Extract<keyof P, `on${string}`>>>,
  ): Readonly<Record<Events[number], Extract<keyof P, `on${string}`>>> =>
    names

const playerEvents = reactEvents<PlayerProps>()(FRAME_ELEMENTS.player.events, { 'segnavia-labels': 'onSegnaviaLabels' })
const stageEvents = reactEvents<StageProps>()(FRAME_ELEMENTS.stage.events, {
  'segnavia-controller': 'onSegnaviaController',
  'segnavia-fit': 'onSegnaviaFit',
  'segnavia-frame-mount': 'onSegnaviaFrameMount',
  'segnavia-frame-release': 'onSegnaviaFrameRelease',
})
const thumbnailEvents = reactEvents<ThumbnailProps>()(FRAME_ELEMENTS.thumbnail.events, {
  'segnavia-thumbnail-error': 'onSegnaviaThumbnailError',
})
const paperPickerEvents = reactEvents<PaperPickerProps>()(FRAME_ELEMENTS.paperPicker.events, { change: 'onChange' })
const itemSettingsEvents = reactEvents<ItemSettingsProps>()(FRAME_ELEMENTS.itemSettings.events, {
  'segnavia-fill-select': 'onSegnaviaFillSelect',
  'segnavia-fill-input': 'onSegnaviaFillInput',
})

function element<E extends object, P extends object, Tag extends `segnavia-${string}`>(
  value: Omit<ElementDescriptor<E, P, Tag>, 'events'> & { events: Readonly<Record<string, Extract<keyof P, `on${string}`>>> },
): ElementDescriptor<E, P, Tag> {
  return { ...value, events: invertEvents(value.events) }
}

export const ELEMENTS = {
  player: element<SegnaviaPlayer, PlayerProps, typeof FRAME_ELEMENTS.player.tag>({ ...FRAME_ELEMENTS.player, events: playerEvents }),
  stage: element<SegnaviaStage, StageProps, typeof FRAME_ELEMENTS.stage.tag>({ ...FRAME_ELEMENTS.stage, events: stageEvents }),
  thumbnail: element<SegnaviaThumbnail, ThumbnailProps, typeof FRAME_ELEMENTS.thumbnail.tag>({ ...FRAME_ELEMENTS.thumbnail, events: thumbnailEvents }),
  paperPicker: element<SegnaviaPaperPicker, PaperPickerProps, typeof FRAME_ELEMENTS.paperPicker.tag>({
    ...FRAME_ELEMENTS.paperPicker,
    events: paperPickerEvents,
  }),
  itemSettings: element<SegnaviaItemSettings, ItemSettingsProps, typeof FRAME_ELEMENTS.itemSettings.tag>({
    ...FRAME_ELEMENTS.itemSettings,
    events: itemSettingsEvents,
  }),
  page: element<SegnaviaPage, PageProps, typeof FRAME_ELEMENTS.page.tag>({
    ...FRAME_ELEMENTS.page,
    events: reactEvents<PageProps>()(FRAME_ELEMENTS.page.events, { asof: 'onAsof', ready: 'onReady' }),
  }),
  book: element<SegnaviaBook, BookProps, typeof FRAME_ELEMENTS.book.tag>({
    ...FRAME_ELEMENTS.book,
    events: reactEvents<BookProps>()(FRAME_ELEMENTS.book.events, {}),
  }),
  paper: element<SegnaviaPaper, PaperProps, typeof FRAME_ELEMENTS.paper.tag>({
    ...FRAME_ELEMENTS.paper,
    events: reactEvents<PaperProps>()(FRAME_ELEMENTS.paper.events, {}),
  }),
  document: element<SegnaviaDocument, DocumentProps, typeof FRAME_ELEMENTS.document.tag>({
    ...FRAME_ELEMENTS.document,
    events: reactEvents<DocumentProps>()(FRAME_ELEMENTS.document.events, { asof: 'onAsof' }),
  }),
  play: element<SegnaviaPlay, PlayProps, typeof FRAME_ELEMENTS.play.tag>({
    ...FRAME_ELEMENTS.play,
    events: reactEvents<PlayProps>()(FRAME_ELEMENTS.play.events, {}),
  }),
  step: element<SegnaviaStep, StepProps, typeof FRAME_ELEMENTS.step.tag>({
    ...FRAME_ELEMENTS.step,
    events: reactEvents<StepProps>()(FRAME_ELEMENTS.step.events, {}),
  }),
  track: element<SegnaviaTrack, TrackProps, typeof FRAME_ELEMENTS.track.tag>({
    ...FRAME_ELEMENTS.track,
    events: reactEvents<TrackProps>()(FRAME_ELEMENTS.track.events, {}),
  }),
  counter: element<SegnaviaCounter, CounterProps, typeof FRAME_ELEMENTS.counter.tag>({
    ...FRAME_ELEMENTS.counter,
    events: reactEvents<CounterProps>()(FRAME_ELEMENTS.counter.events, {}),
  }),
  time: element<SegnaviaTime, TimeProps, typeof FRAME_ELEMENTS.time.tag>({
    ...FRAME_ELEMENTS.time,
    events: reactEvents<TimeProps>()(FRAME_ELEMENTS.time.events, {}),
  }),
  mute: element<SegnaviaMute, MuteProps, typeof FRAME_ELEMENTS.mute.tag>({
    ...FRAME_ELEMENTS.mute,
    events: reactEvents<MuteProps>()(FRAME_ELEMENTS.mute.events, {}),
  }),
  captions: element<SegnaviaCaptions, CaptionsProps, typeof FRAME_ELEMENTS.captions.tag>({
    ...FRAME_ELEMENTS.captions,
    events: reactEvents<CaptionsProps>()(FRAME_ELEMENTS.captions.events, {}),
  }),
  caption: element<SegnaviaCaption, CaptionProps, typeof FRAME_ELEMENTS.caption.tag>({
    ...FRAME_ELEMENTS.caption,
    events: reactEvents<CaptionProps>()(FRAME_ELEMENTS.caption.events, {}),
  }),
  notes: element<SegnaviaNotes, NotesProps, typeof FRAME_ELEMENTS.notes.tag>({
    ...FRAME_ELEMENTS.notes,
    events: reactEvents<NotesProps>()(FRAME_ELEMENTS.notes.events, {}),
  }),
  fullscreen: element<SegnaviaFullscreen, FullscreenProps, typeof FRAME_ELEMENTS.fullscreen.tag>({
    ...FRAME_ELEMENTS.fullscreen,
    events: reactEvents<FullscreenProps>()(FRAME_ELEMENTS.fullscreen.events, {}),
  }),
  rail: element<SegnaviaRail, RailProps, typeof FRAME_ELEMENTS.rail.tag>({
    ...FRAME_ELEMENTS.rail,
    events: reactEvents<RailProps>()(FRAME_ELEMENTS.rail.events, {}),
  }),
} as const

export type AnyElementDescriptor = RuntimeElementDescriptor
export type ElementFor<D> = D extends ElementDescriptor<infer E, infer _P, infer _Tag> ? E : never
export type PropsFor<D> = D extends ElementDescriptor<infer _E, infer P, infer _Tag> ? P : never
