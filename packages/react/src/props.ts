import type { ControllerOptions, DeckController, FittedSize, HostTransition, SegnaviaStage, StageReserve } from '@segnavia/frame'
import type {
  PlayerLabels,
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
import type { HTMLAttributes, ReactNode } from 'react'

type ElementProps<E extends HTMLElement> = Omit<HTMLAttributes<E>, 'children'> & { children?: ReactNode }
type CustomEventProp<D = unknown> = (event: CustomEvent<D>) => void
type ControlProps<E extends HTMLElement> = ElementProps<E> & {
  controller?: DeckController | null
  labels?: Partial<PlayerLabels>
  for?: string
}

export interface PlayerProps extends ElementProps<SegnaviaPlayer> {
  labels?: Partial<PlayerLabels>
  css?: string
  cspExtra?: string
  resolveSlide?: ControllerOptions['resolveSlide']
  transition?: HostTransition
  src?: string
  theme?: string
  notes?: boolean
  rail?: boolean
  hash?: string
  prefetch?: boolean
  playback?: 'step' | 'continuous'
  captions?: 'on' | 'off' | 'viewer'
  presentation?: 'window' | 'native' | 'off'
  fit?: 'width' | 'height'
  transitionDuration?: number
  onSegnaviaLabels?: CustomEventProp
}

export interface StageProps extends ElementProps<SegnaviaStage> {
  controller?: DeckController | null
  css?: string
  cspExtra?: string
  frameTitle?: SegnaviaStage['frameTitle']
  transition?: HostTransition
  reserve?: StageReserve
  src?: string
  hash?: string
  prefetch?: boolean
  fit?: 'box' | 'viewport'
  neighbors?: boolean
  unstyled?: boolean
  transitionDuration?: number
  onSegnaviaController?: CustomEventProp
  onSegnaviaFit?: CustomEventProp<FittedSize>
}

export type PlayProps = ControlProps<SegnaviaPlay>
export type StepProps = ControlProps<SegnaviaStep> & { to?: 'previous' | 'next' }
export type TrackProps = ControlProps<SegnaviaTrack>
export type CounterProps = ControlProps<SegnaviaCounter>
export type TimeProps = ControlProps<SegnaviaTime>
export type MuteProps = ControlProps<SegnaviaMute>
export type CaptionsProps = ControlProps<SegnaviaCaptions>
export type CaptionProps = ControlProps<SegnaviaCaption>
export type NotesProps = ControlProps<SegnaviaNotes>
export type FullscreenProps = ControlProps<SegnaviaFullscreen> & {
  mode?: 'window' | 'native'
  target?: string
  targetElement?: Element | null
}
export type RailProps = ControlProps<SegnaviaRail> & { mountMargin?: number }
