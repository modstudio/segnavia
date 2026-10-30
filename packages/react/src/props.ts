import type {
  ControllerOptions,
  DeckController,
  FittedSize,
  HostTransition,
  PageInput,
  PrintInput,
  SegnaviaDocument,
  SegnaviaPage,
  SegnaviaPaper,
  SegnaviaStage,
  SegnaviaThumbnail,
  StageReserve,
} from '@segnavia/frame'
import type {
  PaperPickerLabelOverrides,
  PlayerLabels,
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
import type { ItemSettingsLabels, SegnaviaItemSettings } from '@segnavia/frame/item-settings'
import type { PlayerControls, PlayerFit, SegnaviaPlayer } from '@segnavia/frame/player'
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
  dependencyOrigins?: SegnaviaPlayer['dependencyOrigins']
  resolveSlide?: ControllerOptions['resolveSlide']
  transition?: HostTransition
  slots?: SegnaviaPlayer['slots']
  src?: string
  theme?: string
  notes?: boolean
  rail?: boolean
  hash?: string
  prefetch?: boolean
  playback?: ControllerOptions['playback']
  captions?: 'on' | 'off' | 'viewer'
  presentation?: 'window' | 'native' | 'off'
  fit?: PlayerFit
  controls?: PlayerControls
  transitionDuration?: number
  onSegnaviaLabels?: CustomEventProp
}

export interface StageProps extends ElementProps<SegnaviaStage> {
  controller?: DeckController | null
  css?: string
  cspExtra?: string
  dependencyOrigins?: SegnaviaStage['dependencyOrigins']
  bridgeReadyTimeoutMs?: SegnaviaStage['bridgeReadyTimeoutMs']
  frameTitle?: SegnaviaStage['frameTitle']
  transition?: HostTransition
  reserve?: StageReserve
  slots?: SegnaviaStage['slots']
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

export interface ThumbnailProps extends ElementProps<SegnaviaThumbnail> {
  deck?: SegnaviaThumbnail['deck']
  page?: PageInput | null
  print?: PrintInput | null
  index?: number
  resolveSlide?: ControllerOptions['resolveSlide']
  base?: string
  css?: string
  mountMargin?: number
  slots?: SegnaviaThumbnail['slots']
  motifs?: SegnaviaThumbnail['motifs']
  fonts?: SegnaviaThumbnail['fonts']
  onSegnaviaThumbnailError?: CustomEventProp<unknown>
}

export type PaperPickerProps = Omit<ElementProps<SegnaviaPaperPicker>, 'onChange'> & {
  value?: SegnaviaPaperPicker['value']
  labels?: PaperPickerLabelOverrides
  onChange?: CustomEventProp<SegnaviaPaperPicker['value']>
}

export type ItemSettingsProps = ElementProps<SegnaviaItemSettings> & {
  declarations?: SegnaviaItemSettings['declarations']
  fills?: SegnaviaItemSettings['fills']
  fill?: SegnaviaItemSettings['fill']
  source?: SegnaviaItemSettings['source']
  report?: SegnaviaItemSettings['report']
  labels?: Partial<ItemSettingsLabels>
  onSegnaviaFillSelect?: CustomEventProp<string>
}

export interface PageProps extends ElementProps<SegnaviaPage> {
  page?: PageInput | null
  css?: string
  cspExtra?: string
  dependencyOrigins?: SegnaviaPage['dependencyOrigins']
  slots?: SegnaviaPage['slots']
  motifs?: SegnaviaPage['motifs']
  fonts?: SegnaviaPage['fonts']
  src?: string
  label?: string
  bounded?: boolean
  unstyled?: boolean
}

export interface PaperProps extends ElementProps<SegnaviaPaper> {
  paper?: number
  side?: SegnaviaPaper['side']
  css?: string
  cspExtra?: string
  dependencyOrigins?: SegnaviaPaper['dependencyOrigins']
  slots?: SegnaviaPaper['slots']
  motifs?: SegnaviaPaper['motifs']
  fonts?: SegnaviaPaper['fonts']
  unstyled?: boolean
}

export interface DocumentProps extends ElementProps<SegnaviaDocument> {
  pages?: PageInput[]
  print?: PrintInput | null
  css?: string
  cspExtra?: string
  dependencyOrigins?: SegnaviaDocument['dependencyOrigins']
  slots?: SegnaviaDocument['slots']
  motifs?: SegnaviaDocument['motifs']
  fonts?: SegnaviaDocument['fonts']
  unstyled?: boolean
}

export type PlayProps = ControlProps<SegnaviaPlay>
export type StepProps = ControlProps<SegnaviaStep> & {
  to?: 'previous' | 'next'
}
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
