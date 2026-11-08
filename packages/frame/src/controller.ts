import type { Deck, PublishedShot, Slide } from '@segnavia/format'
import { emitControllerComplete, emitControllerState } from './controller-events.ts'
import { stateForDeckLoad } from './controller-load.ts'
import { controllerHashIndex, goControllerToSlide, handleControllerHash, prefetchControllerNeighbors, writeControllerHash } from './controller-navigation.ts'
import { captionsPolicy, type PlayerOptions, playerOptionState } from './controller-options.ts'
import { handleControllerPageKey } from './controller-page-key.ts'
import { replacePlacementLifetime, setPlacementOptions } from './controller-placement-options.ts'
import { ControllerPlayback } from './controller-playback.ts'
import { type ContentRefreshResult, refreshControllerContent } from './controller-refresh.ts'
import { resolveFreshContent } from './controller-resolution.ts'
import { type ControllerOptions, type DeckState, initialDeckState, type ResolvedContent } from './controller-types.ts'
import { internalDeckLoad, resolveDeckLoad } from './deck-load-origin.ts'
import { type DeckAction, keyAction } from './keys.ts'
import { navigationError } from './navigation-error.ts'
import { addNavigationGuard, type NavigationGuardReason, runNavigationGuard } from './navigation-guard.ts'
import { limitNavigation, slideRequest } from './navigation-limit.ts'
import { hasWindow } from './schedule.ts'
import { deckTimeline, positionAt, slideDurationMs } from './timeline.ts'
import { DEFAULT_VIEWER_SETTINGS, readViewerSettings, writeViewerSettings } from './viewer-settings.ts'

export type { ControllerOptions, DeckState, ResolvedContent, SeekPolicy, WatchedState } from './controller-types.ts'
export class DeckController extends EventTarget {
  private options: ControllerOptions
  private current: DeckState = initialDeckState()
  private playback: ControllerPlayback
  private shows = 0
  private refreshing: Promise<ContentRefreshResult> | null = null
  private shots = new Map<string, Promise<PublishedShot>>()
  private prefetched = new Map<string, Promise<ResolvedContent>>()
  private placementLifetime = new AbortController()
  private lastCue = ''
  private presented: HTMLElement | null = null
  private bodyOverflow = ''
  private listening = false
  private completeEmitted = false
  private settings = { ...DEFAULT_VIEWER_SETTINGS }
  constructor(options: ControllerOptions = {}) {
    super()
    if (options.completeAt !== undefined && (!(options.completeAt > 0) || options.completeAt > 1))
      throw new RangeError(`completeAt ${options.completeAt} is outside the allowed range (0, 1].`)
    this.options = { hash: null, keys: 'stage', seek: 'free', completeAt: 1, ...options }
    this.playback = new ControllerPlayback({
      state: () => this.current,
      setState: (state) => {
        this.current = state
      },
      options: () => this.options,
      url: (path) => this.url(path),
      emit: () => this.emit(),
      next: () => this.next(),
      pause: () => this.pause(),
    })
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

  setPlayerOptions(options: PlayerOptions) {
    Object.assign(this.options, options)
    const deck = this.current.deck
    if (!deck) return
    this.current = { ...this.current, ...playerOptionState(deck, this.settings.captionsVisible, this.options) }
    this.emit()
  }
  set resolveSlide(resolve: ControllerOptions['resolveSlide']) {
    this.options.resolveSlide = resolve
  }
  set brands(value: ControllerOptions['brands']) {
    this.options.brands = value
  }
  get resolveSlide(): ControllerOptions['resolveSlide'] {
    return this.options.resolveSlide
  }
  addNavigationGuard(guard: (reason: NavigationGuardReason) => void | Promise<void>): () => void {
    return addNavigationGuard(this, guard)
  }
  set placements(value: ControllerOptions['placements']) {
    if (!setPlacementOptions(this.options, value, this.current.deck, this.prefetched)) return
    void this.show(this.current.index).catch((error) => navigationError(this, this.current.playing, this.current.index, error))
  }
  destroy() {
    this.placementLifetime.abort()
    this.stopPresenting()
    this.playback.stopClock()
    this.disconnectWindow()
  }
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
    await this.loadDeck(input, base, false)
  }
  async loadDeckValue(input: unknown, base?: string): Promise<void> {
    await this.loadDeck(input, base, true)
  }
  async [internalDeckLoad](input: Deck): Promise<void> {
    await this.loadDeck(input, undefined, true)
  }
  private async loadDeck(input: unknown, base: string | undefined, internal: boolean): Promise<void> {
    const guarded = this.current.deck ? runNavigationGuard(this, 'load') : undefined
    if (guarded) await guarded
    if (base) this.options.base = base
    const deck = await resolveDeckLoad(input, this.options.brands?.source, this.placementLifetime.signal, guarded, internal)
    this.placementLifetime = replacePlacementLifetime(this.placementLifetime)
    this.prefetched.clear()
    this.shots.clear()
    const loaded = stateForDeckLoad(this.current, deck, this.settings.captionsVisible, this.options, controllerHashIndex(deck, this.options.hash))
    this.current = { ...this.current, ...loaded }
    this.completeEmitted = false
    this.playback.resetWatched(
      deck.slides.map((slide) => slideDurationMs(slide)),
      { index: loaded.index, ms: 0 },
    )
    await this.show(loaded.index)
  }
  async go(index: number): Promise<void> {
    if (!limitNavigation(this.current.seek, this.current.watched.reach, slideRequest(index))) return
    await this.navigate(index)
  }
  private async navigate(index: number): Promise<void> {
    const deck = this.current.deck
    if (!deck || index < 0 || index >= deck.slides.length) return
    try {
      if (index !== this.current.index) await runNavigationGuard(this)
      if (this.current.deck !== deck) return
      await this.show(index, true)
    } catch (error) {
      navigationError(this, this.current.playing, index, error)
    }
  }
  async goToSlide(id: string): Promise<boolean> {
    return goControllerToSlide(this, id)
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
  refreshContent(): Promise<ContentRefreshResult> {
    if (!this.options.resolveSlide) return Promise.resolve('refreshed')
    const { index, slide } = this.current
    if (!slide) return Promise.resolve('superseded')
    const shown = this.shows
    let refreshing!: Promise<ContentRefreshResult>
    refreshing = refreshControllerContent(
      index,
      slide,
      (candidate, candidateIndex) => this.resolveFresh(candidate, candidateIndex),
      () => shown === this.shows && index === this.current.index,
      () => (refreshing === this.refreshing ? undefined : this.refreshing),
      (content) => {
        this.current = { ...this.current, content }
      },
      this,
    )
    this.refreshing = refreshing
    return refreshing
  }
  forgetContent(slideId: string) {
    this.prefetched.delete(slideId)
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
    const index = this.current.index + 1
    if (!limitNavigation(this.current.seek, this.current.watched.reach, slideRequest(index))) return
    if (deck && this.current.index < deck.slides.length - 1) return this.navigate(index)
    this.pause()
    this.dispatchEvent(new CustomEvent('end'))
  }
  async previous(): Promise<void> {
    if (this.current.index > 0) await this.navigate(this.current.index - 1)
  }

  async play(): Promise<void> {
    const { deck, index, slide } = this.current
    this.current = { ...this.current, playing: true }
    if (slide && index + 1 === deck?.slides.length && (this.playback.clock?.ended() || slideDurationMs(slide) === null)) return this.go(0)
    if (!slide || slideDurationMs(slide) === null) return this.next()
    if (this.playback.clock) {
      this.playback.clock.resume()
      this.playback.scheduleTick()
    } else this.playback.startClock(this.current.slideElapsedMs)
    this.emit()
  }

  pause() {
    this.playback.cancelTick()
    this.playback.clock?.pause()
    this.playback.readClock()
    this.current = { ...this.current, playing: false }
    this.emit()
  }

  async seek(deckMs: number): Promise<void> {
    const deck = this.current.deck
    if (!deck) return
    const timeline = deckTimeline(deck)
    const requested = positionAt(timeline, deckMs)
    const allowed = limitNavigation(this.current.seek, this.current.watched.reach, {
      kind: 'position',
      to: { index: requested.index, ms: requested.localMs },
    })
    if (!allowed) return
    const { index, ms: localMs } = allowed
    const entry = timeline.slides[index]
    if (!entry) return
    const wasPlaying = this.current.playing
    try {
      if (index !== this.current.index) await runNavigationGuard(this)
      if (this.current.deck !== deck) return
      if (!(await this.show(index, true))) return
    } catch (error) {
      navigationError(this, this.current.playing, index, error)
    }
    if (entry.untimed) {
      this.current = { ...this.current, playing: false, elapsedMs: entry.startMs, slideElapsedMs: 0, progress: 0 }
      this.emit()
      return
    }
    const slide = deck.slides[index]
    if (!slide) return
    const local = slide.narration?.live && localMs > 0 ? 0 : localMs
    if (!this.playback.clock) this.playback.startClock(local)
    else {
      this.playback.clock.seek(local)
      this.playback.jump({ index, ms: local })
    }
    if (!wasPlaying) this.pause()
    else {
      this.playback.readClock()
      this.emit()
    }
  }
  setMuted(muted: boolean) {
    this.settings.muted = muted
    if (this.playback.clock) this.playback.clock.muted = muted
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
    this.playback.stopClock()
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
      writeControllerHash(this.options.hash, index)
    }
    const duration = slideDurationMs(slide)
    const playing = this.current.playing && duration !== null
    const timeline = deckTimeline(deck)
    const startMs = timeline.slides[index]?.startMs ?? 0
    this.current = { ...this.current, slide, content, playing, word: null, shown: null, progress: 0, elapsedMs: startMs, slideElapsedMs: 0 }
    this.playback.show(index)
    this.lastCue = ''
    if (playing) this.playback.startClock()
    this.emit()
    this.dispatchEvent(new CustomEvent('slide', { detail: { index } }))
    this.prefetch()
    return true
  }
  private prefetch() {
    prefetchControllerNeighbors(this.options.prefetch, this.current.deck, this.current.index, (index) => this.contentFor(index))
  }

  private resolve(slide: Slide, index: number): Promise<ResolvedContent> {
    const ready = this.prefetched.get(slide.id)
    this.prefetched.delete(slide.id)
    return ready ?? this.resolveFresh(slide, index)
  }
  private async resolveFresh(slide: Slide, index: number): Promise<ResolvedContent> {
    return resolveFreshContent(
      slide,
      index,
      this.options.resolveSlide,
      (path) => this.url(path),
      this.shots,
      this.options.placements,
      this.current.deck?.size.width ?? 1280,
      this.placementLifetime.signal,
    )
  }
  url(path: string): string {
    return new URL(path, this.options.base ?? (hasWindow ? location.href : undefined)).href
  }

  private persistSettings() {
    writeViewerSettings(this.options.persist !== false, this.settings)
  }

  private emit() {
    this.lastCue = emitControllerState(this, this.current, this.lastCue)
    this.completeEmitted = emitControllerComplete(this, this.current, this.completeEmitted)
  }

  private onHash = () => handleControllerHash(this, this.current.deck, this.options.hash, this.current.seek, this.current.watched.reach)
  private onPageKey = (event: KeyboardEvent) => handleControllerPageKey(this, event)
}
