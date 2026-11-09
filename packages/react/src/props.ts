import type {
  AsOfDay,
  ControllerOptions,
  DeckController,
  DocumentInput,
  FittedSize,
  HostTransition,
  PrintInput,
  SegnaviaBook,
  SegnaviaDocument,
  SegnaviaPage,
  SegnaviaPaper,
  SegnaviaStage,
  SegnaviaThumbnail,
  StageFrameDetail,
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
import type { ItemSettingsControls, ItemSettingsLabels, SegnaviaItemSettings } from '@segnavia/frame/item-settings'
import type { PlayerControls, PlayerFit, SegnaviaPlayer } from '@segnavia/frame/player'
import type { HTMLAttributes, ReactNode } from 'react'

export type ElementProps<E> = Omit<HTMLAttributes<E>, 'children'> & { children?: ReactNode }
export type CustomEventProp<D = unknown> = (event: CustomEvent<D>) => void
type ControlProps<E extends HTMLElement> = ElementProps<E> & {
  controller?: DeckController | null
  labels?: Partial<PlayerLabels>
  for?: string
}

export interface PlayerProps extends ElementProps<SegnaviaPlayer> {
  labels?: Partial<PlayerLabels>
  css?: string
  cspExtra?: string
  origins?: SegnaviaPlayer['origins']
  resolveSlide?: ControllerOptions['resolveSlide']
  placements?: SegnaviaPlayer['placements']
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
  origins?: SegnaviaStage['origins']
  bridgeReadyTimeoutMs?: SegnaviaStage['bridgeReadyTimeoutMs']
  frameTitle?: SegnaviaStage['frameTitle']
  transition?: HostTransition
  reserve?: StageReserve
  slots?: SegnaviaStage['slots']
  brands?: SegnaviaStage['brands']
  src?: string
  hash?: string
  prefetch?: boolean
  fit?: 'box' | 'viewport'
  neighbors?: boolean
  unstyled?: boolean
  transitionDuration?: number
  onSegnaviaController?: CustomEventProp
  onSegnaviaFit?: CustomEventProp<FittedSize>
  onSegnaviaFrameMount?: CustomEventProp<StageFrameDetail>
  onSegnaviaFrameRelease?: CustomEventProp<StageFrameDetail>
}

export interface ThumbnailProps extends ElementProps<SegnaviaThumbnail> {
  deck?: DocumentInput | null
  page?: DocumentInput | null
  print?: PrintInput | null
  index?: number
  resolveSlide?: ControllerOptions['resolveSlide']
  base?: string
  css?: string
  origins?: SegnaviaThumbnail['origins']
  mountMargin?: number
  slots?: SegnaviaThumbnail['slots']
  motifs?: SegnaviaThumbnail['motifs']
  fonts?: SegnaviaThumbnail['fonts']
  brands?: SegnaviaThumbnail['brands']
  placements?: SegnaviaThumbnail['placements']
  designedCover?: SegnaviaThumbnail['designedCover']
  pageWidths?: SegnaviaThumbnail['pageWidths']
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
  overrides?: SegnaviaItemSettings['overrides']
  source?: SegnaviaItemSettings['source']
  report?: SegnaviaItemSettings['report']
  labels?: Partial<ItemSettingsLabels>
  /** Keep renderer functions at module scope or memoize them; a new function replaces and disposes its controls. */
  controls?: ItemSettingsControls
  onSegnaviaFillSelect?: CustomEventProp<string>
  onSegnaviaFillInput?: CustomEventProp<SegnaviaItemSettings['fills'][number]>
}

export interface PageProps extends ElementProps<SegnaviaPage> {
  page?: DocumentInput | null
  css?: string
  cspExtra?: string
  origins?: SegnaviaPage['origins']
  slots?: SegnaviaPage['slots']
  motifs?: SegnaviaPage['motifs']
  fonts?: SegnaviaPage['fonts']
  brands?: SegnaviaPage['brands']
  alertLabels?: SegnaviaPage['alertLabels']
  placements?: SegnaviaPage['placements']
  anchors?: SegnaviaPage['anchors']
  asOf?: SegnaviaPage['asOf']
  moment?: SegnaviaPage['moment']
  onAsof?: CustomEventProp<AsOfDay>
  pageWidths?: SegnaviaPage['pageWidths']
  src?: string
  label?: string
  bounded?: boolean
  unstyled?: boolean
}

export interface BookProps extends ElementProps<SegnaviaBook> {
  view?: SegnaviaBook['view']
  fonts?: SegnaviaBook['fonts']
  motifs?: SegnaviaBook['motifs']
  placements?: SegnaviaBook['placements']
  pageWidths?: SegnaviaBook['pageWidths']
  origins?: SegnaviaBook['origins']
  src?: string
  spread?: boolean
  layout?: SegnaviaBook['layout']
  unstyled?: boolean
}

export interface PaperProps extends ElementProps<SegnaviaPaper> {
  paper?: number
  side?: SegnaviaPaper['side']
  css?: string
  cspExtra?: string
  origins?: SegnaviaPaper['origins']
  slots?: SegnaviaPaper['slots']
  motifs?: SegnaviaPaper['motifs']
  fonts?: SegnaviaPaper['fonts']
  brands?: SegnaviaPaper['brands']
  placements?: SegnaviaPaper['placements']
  pageWidths?: SegnaviaPaper['pageWidths']
  unstyled?: boolean
}

export interface DocumentProps extends ElementProps<SegnaviaDocument> {
  pages?: DocumentInput[]
  print?: PrintInput | null
  css?: string
  cspExtra?: string
  origins?: SegnaviaDocument['origins']
  slots?: SegnaviaDocument['slots']
  motifs?: SegnaviaDocument['motifs']
  fonts?: SegnaviaDocument['fonts']
  brands?: SegnaviaDocument['brands']
  placements?: SegnaviaDocument['placements']
  anchors?: SegnaviaDocument['anchors']
  asOf?: SegnaviaDocument['asOf']
  moment?: SegnaviaDocument['moment']
  onAsof?: CustomEventProp<AsOfDay>
  pageWidths?: SegnaviaDocument['pageWidths']
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
