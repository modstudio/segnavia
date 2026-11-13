import type { Deck, NarrationPacing, PlaybackMode, Slide, SlideContent, TextDirection } from '@segnavia/format'
import type { AssetPlacementsOptions } from './board-policy.ts'
import type { BrandsOptions } from './brands.ts'
import type { Clock } from './clock.ts'
import type { SeekPolicy } from './navigation-limit.ts'
import type { WatchedState } from './watched.ts'

export type { SeekPolicy, WatchedState }

type FormatResolvedContent = Exclude<SlideContent, { kind: 'shot-ref' } | { media: unknown }>
export type ResolvedUrlContent = Extract<FormatResolvedContent, { kind: 'url' }> & {
  reuseKey?: string
  bridge?: true
  scripts?: 'refuse'
}

export type ResolvedContent = Exclude<FormatResolvedContent, { kind: 'url' }> | ResolvedUrlContent

export interface DeckState {
  deck: Deck | null
  index: number
  slide: Slide | null
  content: ResolvedContent | null
  direction: TextDirection
  playing: boolean
  word: number | null
  shown: number[] | null
  progress: number
  elapsedMs: number
  totalMs: number
  slideElapsedMs: number
  playback: PlaybackMode
  muted: boolean
  captionsVisible: boolean
  presenting: boolean
  seek: SeekPolicy
  watched: WatchedState
}

export interface ControllerOptions {
  brands?: BrandsOptions
  base?: string
  resolveSlide?: (slide: Slide, index: number) => Promise<SlideContent | ResolvedContent> | SlideContent | ResolvedContent
  placements?: AssetPlacementsOptions
  prefetch?: boolean
  keys?: 'stage' | 'page'
  hash?: string | null
  clock?: (slide: Slide, audio: string | null, deck: NarrationPacing) => Clock
  playback?: PlaybackMode
  captions?: 'on' | 'off' | 'viewer'
  persist?: boolean
  schedule?: (tick: () => void) => () => void
  seek?: SeekPolicy
  completeAt?: number
}

export function initialDeckState(): DeckState {
  return {
    deck: null,
    index: 0,
    slide: null,
    content: null,
    direction: 'ltr',
    playing: false,
    word: null,
    shown: null,
    progress: 0,
    elapsedMs: 0,
    totalMs: 0,
    slideElapsedMs: 0,
    playback: 'segmented',
    muted: false,
    captionsVisible: true,
    presenting: false,
    seek: 'free',
    watched: { ms: 0, share: 0, reach: { index: 0, ms: 0 }, complete: false },
  }
}
