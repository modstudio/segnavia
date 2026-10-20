import type { Deck, PlaybackMode, Slide, SlideContent, TextDirection } from '@segnavia/format'
import type { Clock } from './clock.ts'

export type ResolvedContent = Exclude<SlideContent, { kind: 'shot-ref' }>

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
}

export interface ControllerOptions {
  base?: string
  resolveSlide?: (slide: Slide, index: number) => Promise<SlideContent> | SlideContent
  prefetch?: boolean
  keys?: 'stage' | 'page'
  hash?: string | null
  clock?: (slide: Slide, audio: string | null) => Clock
  playback?: PlaybackMode
  captions?: 'on' | 'off' | 'viewer'
  persist?: boolean
  schedule?: (tick: () => void) => () => void
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
  }
}
