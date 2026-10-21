import type { SegnaviaDocument, SegnaviaPage, SegnaviaPaper, SegnaviaStage, SegnaviaThumbnail } from '@segnavia/frame'
import type {
  SegnaviaCaption,
  SegnaviaCaptions,
  SegnaviaCounter,
  SegnaviaFullscreen,
  SegnaviaMute,
  SegnaviaNotes,
  SegnaviaPlay,
  SegnaviaRail,
  SegnaviaStep,
  SegnaviaTime,
  SegnaviaTrack,
} from '@segnavia/frame/controls'
import { HEADLESS_ELEMENTS } from '@segnavia/frame/headless-elements'
import type { SegnaviaPlayer } from '@segnavia/frame/player'
import { STYLED_ELEMENTS } from '@segnavia/frame/styled-elements'
import type {
  CaptionProps,
  CaptionsProps,
  CounterProps,
  DocumentProps,
  FullscreenProps,
  MuteProps,
  NotesProps,
  PageProps,
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

export interface ElementDescriptor<E extends HTMLElement, P extends object, Tag extends `segnavia-${string}` = `segnavia-${string}`>
  extends RuntimeElementDescriptor {
  tag: Tag
  properties: readonly Extract<keyof P, string>[]
  events: Readonly<Partial<Record<Extract<keyof P, `on${string}`>, string>>>
  readonly element?: E
  readonly props?: P
}

function element<E extends HTMLElement, P extends object, Tag extends `segnavia-${string}`>(
  tag: Tag,
  properties: readonly Extract<keyof P, string>[],
  events: Readonly<Partial<Record<Extract<keyof P, `on${string}`>, string>>>,
): ElementDescriptor<E, P, Tag> {
  return { tag, properties, events }
}

const controlProperties = ['controller', 'labels'] as const

export const ELEMENTS = {
  player: element<SegnaviaPlayer, PlayerProps, typeof STYLED_ELEMENTS.player>(
    STYLED_ELEMENTS.player,
    ['labels', 'css', 'cspExtra', 'resolveSlide', 'transition'],
    {
      onSegnaviaLabels: 'segnavia-labels',
    },
  ),
  stage: element<SegnaviaStage, StageProps, typeof HEADLESS_ELEMENTS.stage>(
    HEADLESS_ELEMENTS.stage,
    ['controller', 'css', 'cspExtra', 'frameTitle', 'transition', 'reserve'],
    {
      onSegnaviaController: 'segnavia-controller',
      onSegnaviaFit: 'segnavia-fit',
    },
  ),
  thumbnail: element<SegnaviaThumbnail, ThumbnailProps, typeof HEADLESS_ELEMENTS.thumbnail>(
    HEADLESS_ELEMENTS.thumbnail,
    ['deck', 'page', 'print', 'index', 'resolveSlide', 'base', 'css', 'mountMargin'],
    {
      onSegnaviaThumbnailError: 'segnavia-thumbnail-error',
    },
  ),
  page: element<SegnaviaPage, PageProps, typeof HEADLESS_ELEMENTS.page>(HEADLESS_ELEMENTS.page, ['page', 'css', 'cspExtra'], {}),
  paper: element<SegnaviaPaper, PaperProps, typeof HEADLESS_ELEMENTS.paper>(HEADLESS_ELEMENTS.paper, ['paper', 'side', 'css', 'cspExtra'], {}),
  document: element<SegnaviaDocument, DocumentProps, typeof HEADLESS_ELEMENTS.document>(HEADLESS_ELEMENTS.document, ['css', 'cspExtra', 'pages', 'print'], {}),
  play: element<SegnaviaPlay, PlayProps, typeof STYLED_ELEMENTS.play>(STYLED_ELEMENTS.play, controlProperties, {}),
  step: element<SegnaviaStep, StepProps, typeof STYLED_ELEMENTS.step>(STYLED_ELEMENTS.step, controlProperties, {}),
  track: element<SegnaviaTrack, TrackProps, typeof STYLED_ELEMENTS.track>(STYLED_ELEMENTS.track, controlProperties, {}),
  counter: element<SegnaviaCounter, CounterProps, typeof STYLED_ELEMENTS.counter>(STYLED_ELEMENTS.counter, controlProperties, {}),
  time: element<SegnaviaTime, TimeProps, typeof STYLED_ELEMENTS.time>(STYLED_ELEMENTS.time, controlProperties, {}),
  mute: element<SegnaviaMute, MuteProps, typeof STYLED_ELEMENTS.mute>(STYLED_ELEMENTS.mute, controlProperties, {}),
  captions: element<SegnaviaCaptions, CaptionsProps, typeof STYLED_ELEMENTS.captions>(STYLED_ELEMENTS.captions, controlProperties, {}),
  caption: element<SegnaviaCaption, CaptionProps, typeof STYLED_ELEMENTS.caption>(STYLED_ELEMENTS.caption, controlProperties, {}),
  notes: element<SegnaviaNotes, NotesProps, typeof STYLED_ELEMENTS.notes>(STYLED_ELEMENTS.notes, controlProperties, {}),
  fullscreen: element<SegnaviaFullscreen, FullscreenProps, typeof STYLED_ELEMENTS.fullscreen>(
    STYLED_ELEMENTS.fullscreen,
    [...controlProperties, 'targetElement'],
    {},
  ),
  rail: element<SegnaviaRail, RailProps, typeof STYLED_ELEMENTS.rail>(STYLED_ELEMENTS.rail, [...controlProperties, 'mountMargin'], {}),
} as const

export type AnyElementDescriptor = RuntimeElementDescriptor
export type ElementFor<D> = D extends ElementDescriptor<infer E, infer _P, infer _Tag> ? E : never
export type PropsFor<D> = D extends ElementDescriptor<infer _E, infer P, infer _Tag> ? P : never
