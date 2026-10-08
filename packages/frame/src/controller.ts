// The headless deck: everything a player does, with no markup. It knows the
// current slide, whether it plays, the word being spoken, which annotations
// show and how far the slide has run, and it answers keys in the deck's
// reading direction. A host draws whatever controls it likes from `state`
// and the `change` event; `<segnavia-stage>` draws the slide itself.
//
// Events: change {state} · slide {index} · cue {annotations} · error {index, message} · end.

import { annotationCueIssues, Deck, PublishedShot, resolveDirection, type Slide, type SlideContent, type TextDirection } from '@segnavia/format'
import { type Clock, speechClock, timedClock } from './clock.ts'
import { type DeckAction, keyAction } from './keys.ts'
import { annotationsAt } from './timeline.ts'

export type ResolvedContent = Exclude<SlideContent, { kind: 'shot-ref' }>

export interface DeckState {
  deck: Deck | null
  index: number
  slide: Slide | null
  content: ResolvedContent | null
  direction: TextDirection
  playing: boolean
  // The word being spoken, or null when nothing is.
  word: number | null
  // Annotations to show: a list while playing, null for all of them.
  shown: number[] | null
  // How far the current slide has run, from 0 to 1; 0 on a static slide.
  progress: number
}

export interface ControllerOptions {
  // The address relative paths in the deck resolve against.
  base?: string
  // Mints what a slide needs when it is shown: a ticket URL, a signed image.
  resolveSlide?: (slide: Slide, index: number) => Promise<SlideContent> | SlideContent
  // Resolve the slides either side while one shows; each result is used once.
  prefetch?: boolean
  // The prefix of `#slide-N` addresses, or null to leave the address alone.
  hash?: string | null
  clock?: (narration: NonNullable<Slide['narration']>, audio: string | null) => Clock
  // Calls `tick` on the next frame and returns a way to cancel it.
  schedule?: (tick: () => void) => () => void
}

function defaultSchedule(tick: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }
  const id = setTimeout(tick, 16)
  return () => clearTimeout(id)
}

const hasWindow = typeof window !== 'undefined' && typeof location !== 'undefined'

export class DeckController extends EventTarget {
  private options: ControllerOptions
  private current: DeckState = { deck: null, index: 0, slide: null, content: null, direction: 'ltr', playing: false, word: null, shown: null, progress: 0 }
  private clock: Clock | null = null
  private cancel: (() => void) | null = null
  private shows = 0
  private shots = new Map<string, Promise<PublishedShot>>()
  private prefetched = new Map<number, Promise<ResolvedContent>>()
  private lastCue = ''

  constructor(options: ControllerOptions = {}) {
    super()
    this.options = { hash: 'slide-', ...options }
    if (hasWindow && this.options.hash) window.addEventListener('hashchange', this.onHash)
  }

  get state(): DeckState {
    return this.current
  }

  set resolveSlide(resolve: ControllerOptions['resolveSlide']) {
    this.options.resolveSlide = resolve
  }

  destroy() {
    this.stopClock()
    if (hasWindow) window.removeEventListener('hashchange', this.onHash)
  }

  async loadUrl(src: string): Promise<void> {
    const url = new URL(src, hasWindow ? location.href : undefined).href
    const response = await fetch(url)
    if (!response.ok) throw new Error(`The deck at ${url} answered ${response.status}.`)
    await this.load(await response.json(), url)
  }

  async load(input: unknown, base?: string): Promise<void> {
    if (base) this.options.base = base
    const deck = Deck.parse(input)
    this.prefetched.clear()
    this.shots.clear()
    const direction = resolveDirection(deck.dir, deck.lang, deck.title)
    this.current = { ...this.current, deck, direction, playing: false, index: this.hashIndex(deck) ?? 0 }
    await this.show()
  }

  async go(index: number): Promise<void> {
    const deck = this.current.deck
    if (!deck || index < 0 || index >= deck.slides.length) return
    try {
      await this.show(index, true)
    } catch (error) {
      if (this.current.playing) this.pause()
      this.dispatchEvent(new CustomEvent('error', { detail: { index, message: error instanceof Error ? error.message : String(error) } }))
      throw error
    }
  }

  async next(): Promise<void> {
    const deck = this.current.deck
    if (deck && this.current.index < deck.slides.length - 1) return this.go(this.current.index + 1)
    this.pause()
    this.dispatchEvent(new CustomEvent('end'))
  }

  async previous(): Promise<void> {
    if (this.current.index > 0) await this.go(this.current.index - 1)
  }

  // Pressed on a static slide, play moves on to the next one and plays it.
  async play(): Promise<void> {
    this.current = { ...this.current, playing: true }
    if (!this.current.slide?.narration) return this.next()
    this.startClock()
    this.emit()
  }

  pause() {
    this.stopClock()
    this.current = { ...this.current, playing: false, word: null, shown: null, progress: 0 }
    this.emit()
  }

  toggle(): Promise<void> | void {
    return this.current.playing ? this.pause() : this.play()
  }

  // Returns what the key did, so a caller knows whether to prevent its default.
  key(key: string): DeckAction | null {
    const action = keyAction(key, this.current.direction)
    if (action === 'next') void this.next().catch(() => {})
    else if (action === 'previous') void this.previous().catch(() => {})
    else if (action === 'toggle') void Promise.resolve(this.toggle()).catch(() => {})
    else if (action === 'exit') this.dispatchEvent(new CustomEvent('exit'))
    return action
  }

  private async show(index = this.current.index, commitNavigation = false) {
    const deck = this.current.deck as Deck
    const slide = deck.slides[index] as Slide
    const shown = ++this.shows
    this.stopClock()
    const content = await this.resolve(slide, index)
    // A newer show began while this one resolved; it owns the state.
    if (shown !== this.shows) return
    if (commitNavigation) {
      this.current = { ...this.current, index }
      const prefix = this.options.hash
      if (hasWindow && prefix) history.replaceState(null, '', `#${prefix}${index + 1}`)
    }
    const playing = this.current.playing && Boolean(slide.narration)
    this.current = { ...this.current, slide, content, playing, word: null, shown: null, progress: 0 }
    this.lastCue = ''
    if (playing) this.startClock()
    this.emit()
    this.dispatchEvent(new CustomEvent('slide', { detail: { index } }))
    this.prefetch()
  }

  private prefetch() {
    const deck = this.current.deck
    if (!this.options.prefetch || !deck) return
    for (const index of [this.current.index - 1, this.current.index + 1]) {
      const slide = deck.slides[index]
      if (slide && !this.prefetched.has(index)) {
        const ready = this.resolveFresh(slide, index)
        void ready.catch(() => {})
        this.prefetched.set(index, ready)
      }
    }
  }

  private resolve(slide: Slide, index: number): Promise<ResolvedContent> {
    const ready = this.prefetched.get(index)
    this.prefetched.delete(index)
    return ready ?? this.resolveFresh(slide, index)
  }

  private async resolveFresh(slide: Slide, index: number): Promise<ResolvedContent> {
    const content = this.options.resolveSlide ? await this.options.resolveSlide(slide, index) : slide.content
    if (content.kind === 'shot') {
      this.assertCues(slide, content.shot.annotations.length)
      return content
    }
    if (content.kind !== 'shot-ref') return content
    const href = this.url(content.href)
    let published = this.shots.get(href)
    if (!published) {
      published = fetch(href).then(async (response) => {
        if (!response.ok) throw new Error(`The shot at ${href} answered ${response.status}.`)
        return PublishedShot.parse(await response.json())
      })
      this.shots.set(href, published)
    }
    const { src, shot } = await published
    this.assertCues(slide, shot.annotations.length)
    return { kind: 'shot', src: new URL(src, href).href, shot }
  }

  private assertCues(slide: Slide, annotationCount: number) {
    const issues = annotationCueIssues(slide.narration, annotationCount)
    if (issues.length > 0) throw new Error(`Slide "${slide.id}" has invalid cues: ${issues.join('; ')}.`)
  }

  url(path: string): string {
    return new URL(path, this.options.base ?? (hasWindow ? location.href : undefined)).href
  }

  private startClock() {
    const narration = this.current.slide?.narration
    if (!narration) return
    const audio = narration.audio ? this.url(narration.audio) : null
    this.clock = this.options.clock
      ? this.options.clock(narration, audio)
      : narration.live
        ? speechClock(narration, narration.voice)
        : timedClock(narration, audio)
    const tick = () => {
      const clock = this.clock
      if (!clock) return
      const word = clock.word()
      this.current = { ...this.current, word, shown: annotationsAt(narration.cues, word), progress: clock.progress() }
      this.emit()
      if (clock.ended()) void this.next().catch(() => this.pause())
      else this.cancel = (this.options.schedule ?? defaultSchedule)(tick)
    }
    this.cancel = (this.options.schedule ?? defaultSchedule)(tick)
  }

  private stopClock() {
    this.cancel?.()
    this.cancel = null
    this.clock?.stop()
    this.clock = null
  }

  private emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.current }))
    const cue = this.current.shown === null ? 'all' : this.current.shown.join(',')
    if (cue !== this.lastCue) {
      this.lastCue = cue
      this.dispatchEvent(new CustomEvent('cue', { detail: { annotations: this.current.shown } }))
    }
  }

  private hashIndex(deck: Deck): number | null {
    const prefix = this.options.hash
    if (!hasWindow || !prefix || !location.hash.startsWith(`#${prefix}`)) return null
    const index = Number(location.hash.slice(prefix.length + 1)) - 1
    return Number.isInteger(index) && index >= 0 && index < deck.slides.length ? index : null
  }

  private onHash = () => {
    const deck = this.current.deck
    const index = deck ? this.hashIndex(deck) : null
    if (index !== null && index !== this.current.index) void this.go(index).catch(() => {})
  }
}
