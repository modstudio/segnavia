import { type Clock, speechClock, timedClock } from './clock.ts'
import type { ControllerOptions, DeckState } from './controller-types.ts'
import { defaultSchedule } from './schedule.ts'
import { annotationsAt, deckTimeline, slideDurationMs, slideStateAt } from './timeline.ts'
import { addWatchedSpan, createWatchedModel, type Position, showWatchedSlide, type WatchedModel, type WatchedState, watchedState } from './watched.ts'

interface PlaybackHost {
  state(): DeckState
  setState(state: DeckState): void
  options(): ControllerOptions
  url(path: string): string
  emit(): void
  next(): Promise<void>
  pause(): void
}

export class ControllerPlayback {
  clock: Clock | null = null
  private cancel: (() => void) | null = null
  private tickRun = 0
  private mark: Position = { index: 0, ms: 0 }
  private watched: WatchedModel = createWatchedModel([])

  constructor(private host: PlaybackHost) {}

  resetWatched(durations: readonly (number | null)[], position: Position) {
    this.watched = createWatchedModel(durations)
    this.jump(position)
    this.updateWatched()
  }

  show(index: number) {
    this.watched = showWatchedSlide(this.watched, index)
    this.jump({ index, ms: 0 })
    this.updateWatched()
  }

  jump(position: Position) {
    this.mark = position
  }

  private observe(position: Position) {
    if (position.index === this.mark.index && position.ms >= this.mark.ms)
      this.watched = addWatchedSpan(this.watched, position.index, this.mark.ms, position.ms)
    this.mark = position
  }

  private updateWatched() {
    const current = this.host.state()
    this.host.setState({ ...current, watched: this.currentWatched() })
  }

  private currentWatched(): WatchedState {
    return watchedState(this.watched, this.host.options().completeAt)
  }

  startClock(position = 0) {
    const current = this.host.state()
    const slide = current.slide
    if (!slide || slideDurationMs(slide) === null) return
    const narration = slide.narration
    const audio = narration?.audio ? this.host.url(narration.audio) : null
    const options = this.host.options()
    this.clock = options.clock ? options.clock(slide, audio) : narration?.live ? speechClock(slide, narration.voice) : timedClock(slide, audio)
    this.clock.muted = current.muted
    if (!current.playing) this.clock.pause()
    this.clock.seek(position)
    this.jump({ index: current.index, ms: position })
    this.scheduleTick()
  }

  scheduleTick() {
    if (!this.host.state().playing) return
    const run = ++this.tickRun
    const tick = () => {
      if (run !== this.tickRun) return
      const clock = this.clock
      if (!clock) return
      this.readClock()
      this.host.emit()
      if (clock.ended()) void this.host.next().catch(() => this.host.pause())
      else if (run === this.tickRun) this.cancel = (this.host.options().schedule ?? defaultSchedule)(tick)
    }
    this.cancel = (this.host.options().schedule ?? defaultSchedule)(tick)
  }

  readClock() {
    const clock = this.clock
    const current = this.host.state()
    const { slide, deck } = current
    if (!clock || !slide || !deck) return
    const slideElapsedMs = clock.elapsed()
    this.observe({ index: current.index, ms: slideElapsedMs })
    let moment = slideStateAt(slide, slideElapsedMs)
    const live = slide.narration?.live ? slide.narration : null
    const word = live ? clock.word() : moment.word
    if (live) moment = { ...moment, word, shown: annotationsAt(live.cues, word) }
    const startMs = deckTimeline(deck).slides[current.index]?.startMs ?? 0
    this.host.setState({
      ...this.host.state(),
      word: moment.word,
      shown: moment.shown,
      progress: clock.progress(),
      slideElapsedMs,
      elapsedMs: startMs + slideElapsedMs,
      watched: this.currentWatched(),
    })
  }

  cancelTick() {
    this.tickRun++
    this.cancel?.()
    this.cancel = null
  }

  stopClock() {
    this.cancelTick()
    this.clock?.stop()
    this.clock = null
  }
}
