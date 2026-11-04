import { type Clock, speechClock, timedClock } from './clock.ts'
import type { ControllerOptions, DeckState } from './controller-types.ts'
import { defaultSchedule } from './schedule.ts'
import { annotationsAt, deckTimeline, slideDurationMs, slideStateAt } from './timeline.ts'

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

  constructor(private host: PlaybackHost) {}

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
    this.scheduleTick()
  }

  scheduleTick() {
    if (!this.host.state().playing) return
    const tick = () => {
      const clock = this.clock
      if (!clock) return
      this.readClock()
      this.host.emit()
      if (clock.ended()) void this.host.next().catch(() => this.host.pause())
      else this.cancel = (this.host.options().schedule ?? defaultSchedule)(tick)
    }
    this.cancel = (this.host.options().schedule ?? defaultSchedule)(tick)
  }

  readClock() {
    const clock = this.clock
    const current = this.host.state()
    const { slide, deck } = current
    if (!clock || !slide || !deck) return
    const slideElapsedMs = clock.elapsed()
    let moment = slideStateAt(slide, slideElapsedMs)
    const live = slide.narration?.live ? slide.narration : null
    const word = live ? clock.word() : moment.word
    if (live) moment = { ...moment, word, shown: annotationsAt(live.cues, word) }
    const startMs = deckTimeline(deck).slides[current.index]?.startMs ?? 0
    this.host.setState({
      ...current,
      word: moment.word,
      shown: moment.shown,
      progress: clock.progress(),
      slideElapsedMs,
      elapsedMs: startMs + slideElapsedMs,
    })
  }

  cancelTick() {
    this.cancel?.()
    this.cancel = null
  }

  stopClock() {
    this.cancelTick()
    this.clock?.stop()
    this.clock = null
  }
}
