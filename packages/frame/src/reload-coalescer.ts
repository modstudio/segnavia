export interface ReloadClock {
  set(callback: () => void, delay: number): unknown
  clear(timer: unknown): void
}

export class ReloadCoalescer {
  private timer: unknown
  constructor(
    private readonly clock: ReloadClock,
    private readonly run: () => void,
  ) {}

  schedule(delay: number): void {
    if (this.timer !== undefined) this.clock.clear(this.timer)
    this.timer = this.clock.set(() => {
      this.timer = undefined
      this.run()
    }, delay)
  }

  cancel(): void {
    if (this.timer !== undefined) this.clock.clear(this.timer)
    this.timer = undefined
  }
}
