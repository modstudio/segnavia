import { annotationCueIssues, Deck, PublishedShot, resolveDirection, type Slide } from '@segnavia/format'
import { type Clock, speechClock, timedClock } from './clock.ts'
import { captionsPolicy, playerOptionState } from './controller-options.ts'
import { type ControllerOptions, type DeckState, initialDeckState, type ResolvedContent } from './controller-types.ts'
import { hashSlideIndex, indexAfterReload, neighborWindow } from './deck-window.ts'
import { type DeckAction, isEditableLetterShortcut, isEditableTarget, keyAction } from './keys.ts'
import { navigationError } from './navigation-error.ts'
import { runNavigationGuard } from './navigation-guard.ts'
import { defaultSchedule, hasWindow } from './schedule.ts'
import { annotationsAt, deckTimeline, positionAt, slideDurationMs, slideStateAt } from './timeline.ts'
import { DEFAULT_VIEWER_SETTINGS, readViewerSettings, writeViewerSettings } from './viewer-settings.ts'

export type { ControllerOptions, DeckState, ResolvedContent } from './controller-types.ts'
export class DeckController extends EventTarget {
  private options: ControllerOptions
  private current: DeckState = initialDeckState()
  private clock: Clock | null = null
  private cancel: (() => void) | null = null
  private shows = 0
  private shots = new Map<string, Promise<PublishedShot>>()
  private prefetched = new Map<string, Promise<ResolvedContent>>()
  private lastCue = ''
  private presented: HTMLElement | null = null
  private bodyOverflow = ''
  private listening = false
  private settings = { ...DEFAULT_VIEWER_SETTINGS }

  constructor(options: ControllerOptions = {}) {
    super()
    this.options = { hash: 'slide-', keys: 'stage', ...options }
    this.settings = readViewerSettings(this.options.persist !== false)
    this.current = { ...this.current, ...this.settings }
    this.connectWindow()
  }

  get state(): DeckState {
    return this.current
  }
  get keys(): 'stage' | 'page' {
    return this.options.keys ?? 'stage'
  }
  get captionsPolicy(): 'on' | 'off' | 'viewer' {
    return captionsPolicy(this.current.deck, this.options)
  }

  setPlayerOptions(options: Pick<ControllerOptions, 'playback' | 'captions'>) {
    Object.assign(this.options, options)
    const deck = this.current.deck
    if (!deck) return
    this.current = { ...this.current, ...playerOptionState(deck, this.settings.captionsVisible, this.options) }
    this.emit()
  }
  set resolveSlide(resolve: ControllerOptions['resolveSlide']) {
    this.options.resolveSlide = resolve
  }
  get resolveSlide(): ControllerOptions['resolveSlide'] {
    return this.options.resolveSlide
  }
  destroy() {
    this.stopPresenting()
    this.stopClock()
    this.disconnectWindow()
  }
  // A stage suspends these global listeners while it is disconnected. A host
  // may use the same pair when the controller temporarily has no live view.
  connectWindow() {
    if (!hasWindow || this.listening) return
    if (this.options.hash) window.addEventListener('hashchange', this.onHash)
    if (this.options.keys === 'page') window.addEventListener('keydown', this.onPageKey)
    this.listening = true
  }
  disconnectWindow() {
    if (!hasWindow || !this.listening) return
    window.removeEventListener('hashchange', this.onHash)
    window.removeEventListener('keydown', this.onPageKey)
    this.listening = false
  }

  async loadUrl(src: string): Promise<void> {
    const url = new URL(src, hasWindow ? location.href : undefined).href
    const response = await fetch(url)
    if (!response.ok) throw new Error(`The deck at ${url} answered ${response.status}.`)
    await this.load(await response.json(), url)
  }

  async load(input: unknown, base?: string): Promise<void> {
    if (this.current.deck) await runNavigationGuard(this)
    if (base) this.options.base = base
    const deck = Deck.parse(input)
    const wasOpen = this.current.deck !== null
    const oldIds = this.current.deck?.slides.map((slide) => slide.id) ?? []
    const selectedId = this.current.slide?.id ?? null
    this.prefetched.clear()
    this.shots.clear()
    const direction = resolveDirection(deck.dir, deck.lang, deck.title)
    const playerOptions = playerOptionState(deck, this.settings.captionsVisible, this.options)
    const index = wasOpen
      ? indexAfterReload(
          oldIds,
          deck.slides.map((slide) => slide.id),
          selectedId,
        )
      : (this.hashIndex(deck) ?? 0)
    this.current = { ...this.current, ...playerOptions, deck, direction, playing: false, index, totalMs: deckTimeline(deck).totalMs }
    await this.show(index)
  }

  async go(index: number): Promise<void> {
    const deck = this.current.deck
    if (!deck || index < 0 || index >= deck.slides.length) return
    if (index !== this.current.index) await runNavigationGuard(this)
    await this.show(index, true).catch((error) => navigationError(this, this.current.playing, index, error))
  }

  contentFor(index: number): Promise<ResolvedContent> {
    const slide = this.current.deck?.slides[index]
    if (!slide) return Promise.reject(new RangeError(`Slide ${index + 1} is outside the deck.`))
    let ready = this.prefetched.get(slide.id)
    if (!ready) {
      ready = this.resolveFresh(slide, index)
      void ready.catch(() => {})
      this.prefetched.set(slide.id, ready)
    }
    return ready
  }

  present(element: HTMLElement) {
    if (this.presented === element) return
    this.stopPresenting()
    this.presented = element
    this.bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.dataset.presenting = ''
    this.current = { ...this.current, presenting: true }
    this.emit()
  }

  stopPresenting() {
    if (!this.presented) return
    this.presented.removeAttribute('data-presenting')
    document.body.style.overflow = this.bodyOverflow
    this.presented = null
    this.current = { ...this.current, presenting: false }
    this.emit()
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

  async play(): Promise<void> {
    const { deck, index, slide } = this.current
    this.current = { ...this.current, playing: true }
    if (slide && index + 1 === deck?.slides.length && (this.clock?.ended() || slideDurationMs(slide) === null)) return this.go(0)
    if (!slide || slideDurationMs(slide) === null) return this.next()
    if (this.clock) {
      this.clock.resume()
      this.scheduleTick()
    } else this.startClock(this.current.slideElapsedMs)
    this.emit()
  }

  pause() {
    this.cancel?.()
    this.cancel = null
    this.clock?.pause()
    this.readClock()
    this.current = { ...this.current, playing: false }
    this.emit()
  }

  async seek(deckMs: number): Promise<void> {
    const deck = this.current.deck
    if (!deck) return
    const timeline = deckTimeline(deck)
    const { index, localMs, untimed } = positionAt(timeline, deckMs)
    const entry = timeline.slides[index]
    if (!entry) return
    const wasPlaying = this.current.playing
    if (!(await this.show(index, true).catch((error) => navigationError(this, this.current.playing, index, error)))) return
    if (untimed) {
      this.current = { ...this.current, playing: false, elapsedMs: entry.startMs, slideElapsedMs: 0, progress: 0 }
      this.emit()
      return
    }
    const slide = deck.slides[index]
    if (!slide) return
    const local = slide.narration?.live && localMs > 0 ? 0 : localMs
    if (!this.clock) this.startClock(local)
    else this.clock.seek(local)
    if (!wasPlaying) this.pause()
    else {
      this.readClock()
      this.emit()
    }
  }

  setMuted(muted: boolean) {
    this.settings.muted = muted
    if (this.clock) this.clock.muted = muted
    this.current = { ...this.current, muted }
    this.persistSettings()
    this.emit()
  }

  setCaptionsVisible(visible: boolean) {
    if (this.captionsPolicy !== 'viewer') return
    this.settings.captionsVisible = visible
    this.current = { ...this.current, captionsVisible: visible }
    this.persistSettings()
    this.emit()
  }

  toggle(): Promise<void> | void {
    return this.current.playing ? this.pause() : this.play()
  }

  // Returns what the key did, so a caller knows whether to prevent its default.
  key(key: string): DeckAction | null {
    if (this.options.keys === 'page' && key === ' ') return null
    const action = keyAction(key, this.current.direction)
    if (action === 'next') void this.next().catch(() => {})
    else if (action === 'previous') void this.previous().catch(() => {})
    else if (action === 'toggle') void Promise.resolve(this.toggle()).catch(() => {})
    else if (action === 'mute') this.setMuted(!this.current.muted)
    else if (action === 'captions') this.setCaptionsVisible(!this.current.captionsVisible)
    else if (action === 'exit') {
      this.stopPresenting()
      this.dispatchEvent(new CustomEvent('exit'))
    }
    return action
  }

  private async show(index = this.current.index, commitNavigation = false): Promise<boolean> {
    const deck = this.current.deck as Deck
    const slide = deck.slides[index] as Slide
    const shown = ++this.shows
    this.stopClock()
    let content: ResolvedContent
    try {
      content = await this.resolve(slide, index)
    } catch (error) {
      if (shown !== this.shows) return false
      throw error
    }
    // A newer show began while this one resolved; it owns the state.
    if (shown !== this.shows) return false
    if (commitNavigation) {
      this.current = { ...this.current, index }
      const prefix = this.options.hash
      if (hasWindow && prefix) history.replaceState(null, '', `#${prefix}${index + 1}`)
    }
    const duration = slideDurationMs(slide)
    const playing = this.current.playing && duration !== null
    const timeline = deckTimeline(deck)
    const startMs = timeline.slides[index]?.startMs ?? 0
    this.current = { ...this.current, slide, content, playing, word: null, shown: null, progress: 0, elapsedMs: startMs, slideElapsedMs: 0 }
    this.lastCue = ''
    if (playing) this.startClock()
    this.emit()
    this.dispatchEvent(new CustomEvent('slide', { detail: { index } }))
    this.prefetch()
    return true
  }
  private prefetch() {
    const deck = this.current.deck
    if (!this.options.prefetch || !deck) return
    for (const index of neighborWindow(this.current.index, deck.slides.length)) {
      if (index !== this.current.index) void this.contentFor(index)
    }
  }

  private resolve(slide: Slide, index: number): Promise<ResolvedContent> {
    const ready = this.prefetched.get(slide.id)
    this.prefetched.delete(slide.id)
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

  private startClock(position = 0) {
    const slide = this.current.slide
    if (!slide || slideDurationMs(slide) === null) return
    const narration = slide.narration
    const audio = narration?.audio ? this.url(narration.audio) : null
    this.clock = this.options.clock ? this.options.clock(slide, audio) : narration?.live ? speechClock(slide, narration.voice) : timedClock(slide, audio)
    this.clock.muted = this.current.muted
    if (!this.current.playing) this.clock.pause()
    this.clock.seek(position)
    this.scheduleTick()
  }

  private scheduleTick() {
    if (!this.current.playing) return
    const tick = () => {
      const clock = this.clock
      if (!clock) return
      this.readClock()
      this.emit()
      if (clock.ended()) void this.next().catch(() => this.pause())
      else this.cancel = (this.options.schedule ?? defaultSchedule)(tick)
    }
    this.cancel = (this.options.schedule ?? defaultSchedule)(tick)
  }

  private readClock() {
    const clock = this.clock
    const slide = this.current.slide
    const deck = this.current.deck
    if (!clock || !slide || !deck) return
    const slideElapsedMs = clock.elapsed()
    let moment = slideStateAt(slide, slideElapsedMs)
    const live = slide.narration?.live ? slide.narration : null
    const word = live ? clock.word() : moment.word
    if (live) moment = { ...moment, word, shown: annotationsAt(live.cues, word) }
    const startMs = deckTimeline(deck).slides[this.current.index]?.startMs ?? 0
    this.current = {
      ...this.current,
      word: moment.word,
      shown: moment.shown,
      progress: clock.progress(),
      slideElapsedMs,
      elapsedMs: startMs + slideElapsedMs,
    }
  }

  private stopClock() {
    this.cancel?.()
    this.cancel = null
    this.clock?.stop()
    this.clock = null
  }

  private persistSettings() {
    writeViewerSettings(this.options.persist !== false, this.settings)
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
    return hasWindow && prefix ? hashSlideIndex(location.hash, prefix, deck.slides.length) : null
  }

  private onHash = () => {
    const deck = this.current.deck
    const index = deck ? this.hashIndex(deck) : null
    if (index !== null && index !== this.current.index) void this.go(index).catch(() => {})
  }

  private onPageKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return
    const target = event.target
    const action = keyAction(event.key, this.current.direction)
    if (isEditableLetterShortcut(event.key, target)) return
    if ((action === 'next' || action === 'previous') && isEditableTarget(target)) return
    if (this.key(event.key)) event.preventDefault()
  }
}
