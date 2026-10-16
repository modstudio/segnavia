export const OVERLAY_IDLE_MS = 3000

interface Timers {
  set(run: () => void, delay: number): number
  clear(timer: number): void
}

const browserTimers: Timers = {
  set: (run, delay) => globalThis.setTimeout(run, delay) as unknown as number,
  clear: (timer) => globalThis.clearTimeout(timer),
}

export class OverlayControlsVisibility {
  private playing = false
  private focused = false
  private hidden = false
  private timer: number | null = null

  constructor(
    private changed: (hidden: boolean) => void,
    private timers: Timers = browserTimers,
  ) {}

  setPlaying(playing: boolean) {
    if (playing === this.playing) return
    this.playing = playing
    if (playing) this.schedule()
    else this.reveal(false)
  }

  interact() {
    this.reveal(true)
  }

  key() {
    this.reveal(true)
  }

  focus(focused: boolean) {
    this.focused = focused
    if (focused) this.reveal(false)
    else if (this.playing) this.schedule()
  }

  dispose() {
    this.clear()
  }

  private reveal(schedule: boolean) {
    this.clear()
    if (this.hidden) {
      this.hidden = false
      this.changed(false)
    }
    if (schedule && this.playing && !this.focused) this.schedule()
  }

  private schedule() {
    this.clear()
    if (!this.playing || this.focused) return
    this.timer = this.timers.set(() => {
      this.timer = null
      this.hidden = true
      this.changed(true)
    }, OVERLAY_IDLE_MS)
  }

  private clear() {
    if (this.timer !== null) this.timers.clear(this.timer)
    this.timer = null
  }
}
