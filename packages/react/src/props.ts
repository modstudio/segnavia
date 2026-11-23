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
  SegnaviaBoard,
  SegnaviaBook,
  SegnaviaDocument,
  SegnaviaImage,
  SegnaviaPage,
  SegnaviaPaper,
  SegnaviaPrintedPages,
  SegnaviaSound,
  SegnaviaStage,
  SegnaviaThumbnail,
  StageFrameDetail,
  StageReserve,
} from '@segnavia/frame'
import type { FormsOption } from '@segnavia/frame/bridge'
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
  SegnaviaRefusal,
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
  edition?: string
  labels?: Partial<PlayerLabels>
  css?: string
  cspExtra?: string
  forms?: FormsOption
  fonts?: SegnaviaPlayer['fonts']
  origins?: SegnaviaPlayer['origins']
  resolveSlide?: ControllerOptions['resolveSlide']
  watched?: SegnaviaPlayer['watched']
  placements?: SegnaviaPlayer['placements']
  transition?: HostTransition
  slots?: SegnaviaPlayer['slots']
  anchors?: SegnaviaPlayer['anchors']
  asOf?: SegnaviaPlayer['asOf']
  moment?: SegnaviaPlayer['moment']
  serveFrame?: SegnaviaPlayer['serveFrame']
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
  edition?: string
  controller?: DeckController | null
  css?: string
  cspExtra?: string
  forms?: FormsOption
  fonts?: SegnaviaStage['fonts']
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
  serveFrame?: SegnaviaStage['serveFrame']
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
  onRefusalchange?: (event: Event) => void
  onAsof?: CustomEventProp<AsOfDay>
}

export interface ThumbnailProps extends ElementProps<SegnaviaThumbnail> {
  edition?: string
  deck?: DocumentInput | null
  page?: DocumentInput | null
  print?: PrintInput | null
  index?: number
  resolveSlide?: ControllerOptions['resolveSlide']
  base?: string
  css?: string
  forms?: FormsOption
  origins?: SegnaviaThumbnail['origins']
  mountMargin?: number
  slots?: SegnaviaThumbnail['slots']
  motifs?: SegnaviaThumbnail['motifs']
  fonts?: SegnaviaThumbnail['fonts']
  brands?: SegnaviaThumbnail['brands']
  placements?: SegnaviaThumbnail['placements']
  designedCover?: SegnaviaThumbnail['designedCover']
  pageWidths?: SegnaviaThumbnail['pageWidths']
  ratio?: SegnaviaThumbnail['ratio']
  anchors?: SegnaviaThumbnail['anchors']
  asOf?: SegnaviaThumbnail['asOf']
  moment?: SegnaviaThumbnail['moment']
  serveFrame?: SegnaviaThumbnail['serveFrame']
  onAsof?: CustomEventProp<AsOfDay>
  onSegnaviaThumbnailError?: CustomEventProp<unknown>
}

export interface ImageProps extends ElementProps<SegnaviaImage> {
  media?: SegnaviaImage['media']
  src?: string
}

export interface SoundProps extends ElementProps<SegnaviaSound> {
  sound?: SegnaviaSound['sound']
  src?: string
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
  edition?: string
  page?: DocumentInput | null
  css?: string
  cspExtra?: string
  forms?: FormsOption
  origins?: SegnaviaPage['origins']
  slots?: SegnaviaPage['slots']
  motifs?: SegnaviaPage['motifs']
  fonts?: SegnaviaPage['fonts']
  brands?: SegnaviaPage['brands']
  alertLabels?: SegnaviaPage['alertLabels']
  newId?: SegnaviaPage['newId']
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
  serveFrame?: SegnaviaPage['serveFrame']
  src?: string
  label?: string
  bounded?: boolean
  unstyled?: boolean
}

export interface PrintedPagesProps extends Omit<ElementProps<SegnaviaPrintedPages>, 'onError'> {
  edition?: string
  document?: DocumentInput | null
  page?: SegnaviaPrintedPages['page']
  recordFor?: SegnaviaPrintedPages['recordFor']
  layout?: SegnaviaPrintedPages['layout']
  fit?: SegnaviaPrintedPages['fit']
  zoom?: SegnaviaPrintedPages['zoom']
  composeMargin?: SegnaviaPrintedPages['composeMargin']
  keepMargin?: SegnaviaPrintedPages['keepMargin']
  reloadDelay?: SegnaviaPrintedPages['reloadDelay']
  css?: string
  cspExtra?: string
  origins?: SegnaviaPrintedPages['origins']
  slots?: SegnaviaPrintedPages['slots']
  motifs?: SegnaviaPrintedPages['motifs']
  fonts?: SegnaviaPrintedPages['fonts']
  brands?: SegnaviaPrintedPages['brands']
  alertLabels?: SegnaviaPrintedPages['alertLabels']
  newId?: SegnaviaPrintedPages['newId']
  placements?: SegnaviaPrintedPages['placements']
  pageWidths?: SegnaviaPrintedPages['pageWidths']
  anchors?: SegnaviaPrintedPages['anchors']
  asOf?: SegnaviaPrintedPages['asOf']
  moment?: SegnaviaPrintedPages['moment']
  profile?: SegnaviaPrintedPages['profile']
  serveFrame?: SegnaviaPrintedPages['serveFrame']
  onPage?: CustomEventProp<{ page: number; pageCount: number }>
  onRecord?: CustomEventProp<{ record: string | undefined }>
  onAsof?: CustomEventProp<AsOfDay>
  onPreflight?: CustomEventProp<PreflightReport>
  onFontfailure?: CustomEventProp<FontFailureDetail>
  onError?: ErrorEventProp
}

export interface BookProps extends Omit<ElementProps<SegnaviaBook>, 'onError'> {
  forms?: FormsOption
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
  serveFrame?: SegnaviaBook['serveFrame']
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
  edition?: string
  paper?: number
  side?: SegnaviaPaper['side']
  css?: string
  cspExtra?: string
  forms?: FormsOption
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
  serveFrame?: SegnaviaPaper['serveFrame']
  unstyled?: boolean
  onFontfailure?: CustomEventProp<FontFailureDetail>
  onAsof?: CustomEventProp<AsOfDay>
  onError?: ErrorEventProp
  onChange?: (event: Event) => void
}

export interface BoardProps extends ElementProps<SegnaviaBoard> {
  forms?: FormsOption
  edition?: string
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
  revealMaxZoom?: SegnaviaBoard['revealMaxZoom']
  resolveItem?: SegnaviaBoard['resolveItem']
  itemNames?: SegnaviaBoard['itemNames']
  serveFrame?: SegnaviaBoard['serveFrame']
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
  edition?: string
  pages?: DocumentInput[]
  print?: PrintInput | null
  css?: string
  cspExtra?: string
  forms?: FormsOption
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
export type RefusalProps = ElementProps<SegnaviaRefusal> & {
  labels?: Partial<PlayerLabels>
  refusal?: SegnaviaRefusal['refusal']
}

type Assert<T extends true> = T
type EventParameter<T> = T extends (event: infer E) => void ? E : never
type ExactEvent<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false
type _BookErrorIsExactlyErrorEvent = Assert<ExactEvent<EventParameter<NonNullable<BookProps['onError']>>, ErrorEvent>>
type _PaperChangeIsExactlyEvent = Assert<ExactEvent<EventParameter<NonNullable<PaperProps['onChange']>>, Event>>
