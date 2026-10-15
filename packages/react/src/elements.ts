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
import type { SegnaviaPlayer } from '@segnavia/frame/player'
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
  events: Readonly<Record<string, string>>
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
  events: Readonly<Partial<Record<Extract<keyof P, `on${string}`>, string>>> = {},
): ElementDescriptor<E, P> {
  return { tag, properties, events }
}

const controlProperties = ['controller', 'labels'] as const

export const ELEMENTS = {
  player: element<SegnaviaPlayer, PlayerProps>(
    'segnavia-player',
    ['labels', 'css', 'cspExtra', 'resolveSlide', 'transition'],
    { onSegnaviaLabels: 'segnavia-labels' },
  ),
  stage: element<SegnaviaStage, StageProps>(
    'segnavia-stage',
    ['controller', 'css', 'cspExtra', 'frameTitle', 'transition', 'reserve'],
    { onSegnaviaController: 'segnavia-controller', onSegnaviaFit: 'segnavia-fit' },
  ),
  play: element<SegnaviaPlay, PlayProps>('segnavia-play', controlProperties),
  step: element<SegnaviaStep, StepProps>('segnavia-step', controlProperties),
  track: element<SegnaviaTrack, TrackProps>('segnavia-track', controlProperties),
  counter: element<SegnaviaCounter, CounterProps>('segnavia-counter', controlProperties),
  time: element<SegnaviaTime, TimeProps>('segnavia-time', controlProperties),
  mute: element<SegnaviaMute, MuteProps>('segnavia-mute', controlProperties),
  captions: element<SegnaviaCaptions, CaptionsProps>('segnavia-captions', controlProperties),
  caption: element<SegnaviaCaption, CaptionProps>('segnavia-caption', controlProperties),
  notes: element<SegnaviaNotes, NotesProps>('segnavia-notes', controlProperties),
  fullscreen: element<SegnaviaFullscreen, FullscreenProps>('segnavia-fullscreen', [...controlProperties, 'targetElement']),
  rail: element<SegnaviaRail, RailProps>('segnavia-rail', [...controlProperties, 'mountMargin']),
} as const

export type AnyElementDescriptor = RuntimeElementDescriptor
export type ElementFor<D> = D extends ElementDescriptor<infer E, infer _P> ? E : never
export type PropsFor<D> = D extends ElementDescriptor<infer _E, infer P> ? P : never
