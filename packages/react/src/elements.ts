import type { SegnaviaStage } from '@segnavia/frame'
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
  FullscreenProps,
  MuteProps,
  NotesProps,
  PlayerProps,
  PlayProps,
  RailProps,
  StageProps,
  StepProps,
  TimeProps,
  TrackProps,
} from './props.ts'

export interface RuntimeElementDescriptor {
  tag: `segnavia-${string}`
  properties: readonly string[]
  events: Readonly<Partial<Record<string, string>>>
}

export interface ElementDescriptor<E extends HTMLElement, P extends object> extends RuntimeElementDescriptor {
  properties: readonly Extract<keyof P, string>[]
  events: Readonly<Partial<Record<Extract<keyof P, `on${string}`>, string>>>
  readonly element?: E
  readonly props?: P
}

function element<E extends HTMLElement, P extends object>(
  tag: `segnavia-${string}`,
  properties: readonly Extract<keyof P, string>[],
  events: Readonly<Partial<Record<Extract<keyof P, `on${string}`>, string>>>,
): ElementDescriptor<E, P> {
  return { tag, properties, events }
}

const controlProperties = ['controller', 'labels'] as const

export const ELEMENTS = {
  player: element<SegnaviaPlayer, PlayerProps>(STYLED_ELEMENTS.player, ['labels', 'css', 'cspExtra', 'resolveSlide', 'transition'], {
    onSegnaviaLabels: 'segnavia-labels',
  }),
  stage: element<SegnaviaStage, StageProps>(HEADLESS_ELEMENTS.stage, ['controller', 'css', 'cspExtra', 'frameTitle', 'transition', 'reserve'], {
    onSegnaviaController: 'segnavia-controller',
    onSegnaviaFit: 'segnavia-fit',
  }),
  play: element<SegnaviaPlay, PlayProps>(STYLED_ELEMENTS.play, controlProperties, {}),
  step: element<SegnaviaStep, StepProps>(STYLED_ELEMENTS.step, controlProperties, {}),
  track: element<SegnaviaTrack, TrackProps>(STYLED_ELEMENTS.track, controlProperties, {}),
  counter: element<SegnaviaCounter, CounterProps>(STYLED_ELEMENTS.counter, controlProperties, {}),
  time: element<SegnaviaTime, TimeProps>(STYLED_ELEMENTS.time, controlProperties, {}),
  mute: element<SegnaviaMute, MuteProps>(STYLED_ELEMENTS.mute, controlProperties, {}),
  captions: element<SegnaviaCaptions, CaptionsProps>(STYLED_ELEMENTS.captions, controlProperties, {}),
  caption: element<SegnaviaCaption, CaptionProps>(STYLED_ELEMENTS.caption, controlProperties, {}),
  notes: element<SegnaviaNotes, NotesProps>(STYLED_ELEMENTS.notes, controlProperties, {}),
  fullscreen: element<SegnaviaFullscreen, FullscreenProps>(STYLED_ELEMENTS.fullscreen, [...controlProperties, 'targetElement'], {}),
  rail: element<SegnaviaRail, RailProps>(STYLED_ELEMENTS.rail, [...controlProperties, 'mountMargin'], {}),
} as const

export type AnyElementDescriptor = RuntimeElementDescriptor
export type ElementFor<D> = D extends ElementDescriptor<infer E, infer _P> ? E : never
export type PropsFor<D> = D extends ElementDescriptor<infer _E, infer P> ? P : never
