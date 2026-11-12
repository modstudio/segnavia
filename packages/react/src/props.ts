import type {
  AsOfDay,
  BoardChangeDetail,
  BoardErrorDetail,
  BoardItemActionDetail,
  BoardOpenDetail,
  BoardSelectionDetail,
  BoardViewDetail,
  ComposeProgress,
  ControllerOptions,
  DeckController,
  DocumentInput,
  FittedSize,
  FontFailureDetail,
  HostTransition,
  PreflightReport,
  PrintInput,
  SegnaviaBook,
  SegnaviaBoard,
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
export type ErrorEventProp = (event: ErrorEvent) => void
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
  anchors?: SegnaviaPlayer['anchors']
  asOf?: SegnaviaPlayer['asOf']
  moment?: SegnaviaPlayer['moment']
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

export interface StageProps extends Omit<ElementProps<SegnaviaStage>, 'onError'> {
  controller?: DeckController | null
  css?: string
  cspExtra?: string
  origins?: SegnaviaStage['origins']
  bridgeReadyTimeoutMs?: SegnaviaStage['bridgeReadyTimeoutMs']
  frameTitle?: SegnaviaStage['frameTitle']
  transition?: HostTransition
  reserve?: StageReserve
  slots?: SegnaviaStage['slots']
  anchors?: SegnaviaStage['anchors']
  asOf?: SegnaviaStage['asOf']
  moment?: SegnaviaStage['moment']
  brands?: SegnaviaStage['brands']
  profile?: SegnaviaStage['profile']
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
  onPreflight?: CustomEventProp<PreflightReport>
  onFontfailure?: CustomEventProp<FontFailureDetail>
  onError?: ErrorEventProp
  onAsof?: CustomEventProp<AsOfDay>
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
  anchors?: SegnaviaThumbnail['anchors']
  asOf?: SegnaviaThumbnail['asOf']
  moment?: SegnaviaThumbnail['moment']
  onAsof?: CustomEventProp<AsOfDay>
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

export interface PageProps extends Omit<ElementProps<SegnaviaPage>, 'onError'> {
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
  onReady?: (event: Event) => void
  onPreflight?: CustomEventProp<PreflightReport>
  onFontfailure?: CustomEventProp<FontFailureDetail>
  onError?: ErrorEventProp
  onComposeprogress?: CustomEventProp<ComposeProgress>
  pageWidths?: SegnaviaPage['pageWidths']
  profile?: SegnaviaPage['profile']
  src?: string
  label?: string
  bounded?: boolean
  unstyled?: boolean
}

export interface BookProps extends Omit<ElementProps<SegnaviaBook>, 'onError'> {
  view?: SegnaviaBook['view']
  fonts?: SegnaviaBook['fonts']
  motifs?: SegnaviaBook['motifs']
  placements?: SegnaviaBook['placements']
  pageWidths?: SegnaviaBook['pageWidths']
  origins?: SegnaviaBook['origins']
  anchors?: SegnaviaBook['anchors']
  asOf?: SegnaviaBook['asOf']
  moment?: SegnaviaBook['moment']
  profile?: SegnaviaBook['profile']
  src?: string
  spread?: boolean
  layout?: SegnaviaBook['layout']
  unstyled?: boolean
  onReady?: (event: Event) => void
  onAsof?: CustomEventProp<AsOfDay>
  onPreflight?: CustomEventProp<PreflightReport>
  onFontfailure?: CustomEventProp<FontFailureDetail>
  onError?: ErrorEventProp
  onComposeprogress?: CustomEventProp<ComposeProgress>
}

export interface PaperProps extends Omit<ElementProps<SegnaviaPaper>, 'onError' | 'onChange'> {
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
  anchors?: SegnaviaPaper['anchors']
  asOf?: SegnaviaPaper['asOf']
  moment?: SegnaviaPaper['moment']
  unstyled?: boolean
  onFontfailure?: CustomEventProp<FontFailureDetail>
  onAsof?: CustomEventProp<AsOfDay>
  onError?: ErrorEventProp
  onChange?: (event: Event) => void
}

export interface BoardProps extends ElementProps<SegnaviaBoard> {
  board?: SegnaviaBoard['board']
  motifs?: SegnaviaBoard['motifs']
  placements?: SegnaviaBoard['placements']
  pageWidths?: SegnaviaBoard['pageWidths']
  fonts?: SegnaviaBoard['fonts']
  origins?: SegnaviaBoard['origins']
  anchors?: SegnaviaBoard['anchors']
  asOf?: SegnaviaBoard['asOf']
  moment?: SegnaviaBoard['moment']
  brands?: SegnaviaBoard['brands']
  view?: SegnaviaBoard['view']
  kindIcon?: SegnaviaBoard['kindIcon']
  selection?: SegnaviaBoard['selection']
  selected?: SegnaviaBoard['selected']
  itemActions?: SegnaviaBoard['itemActions']
  labels?: SegnaviaBoard['labels']
  liveWidth?: SegnaviaBoard['liveWidth']
  resolveItem?: SegnaviaBoard['resolveItem']
  itemNames?: SegnaviaBoard['itemNames']
  onSegnaviaBoardChange?: CustomEventProp<BoardChangeDetail>
  onSegnaviaBoardError?: CustomEventProp<BoardErrorDetail>
  onSegnaviaBoardIcons?: CustomEventProp
  onSegnaviaBoardItemAction?: CustomEventProp<BoardItemActionDetail>
  onSegnaviaBoardNames?: CustomEventProp
  onSegnaviaBoardOpen?: CustomEventProp<BoardOpenDetail>
  onSegnaviaBoardSelection?: CustomEventProp<BoardSelectionDetail>
  onSegnaviaBoardView?: CustomEventProp<BoardViewDetail>
}

export interface DocumentProps extends Omit<ElementProps<SegnaviaDocument>, 'onError'> {
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
  profile?: SegnaviaDocument['profile']
  onPreflight?: CustomEventProp<PreflightReport>
  onFontfailure?: CustomEventProp<FontFailureDetail>
  onError?: ErrorEventProp
  onSegnaviaDocumentSlots?: CustomEventProp<null>
  onSegnaviaDocumentPage?: CustomEventProp<{ index: number }>
  onSegnaviaDocumentChange?: CustomEventProp<null>
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

type Assert<T extends true> = T
type EventParameter<T> = T extends (event: infer E) => void ? E : never
type ExactEvent<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false
type _BookErrorIsExactlyErrorEvent = Assert<ExactEvent<EventParameter<NonNullable<BookProps['onError']>>, ErrorEvent>>
type _PaperChangeIsExactlyEvent = Assert<ExactEvent<EventParameter<NonNullable<PaperProps['onChange']>>, Event>>
