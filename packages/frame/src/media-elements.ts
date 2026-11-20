import type { Media, Sound } from '@segnavia/format'
import type { DeckState } from './controller-types.ts'
import { upgradeProperties } from './element-properties.ts'
import type { Playback } from './playback.ts'

class AudioPlayback extends EventTarget implements Playback {
  readonly kind = 'sound' as const
  private current: DeckState = {
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
    playback: 'continuous',
    muted: false,
    captionsVisible: false,
    presenting: false,
    seek: 'free',
    watched: { ms: 0, share: 0, reach: { index: 0, ms: 0 }, complete: false },
  }

  constructor(private readonly audio: HTMLAudioElement) {
    super()
    for (const name of ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange', 'ended']) audio.addEventListener(name, this.read)
  }

  get state(): DeckState {
    return this.current
  }

  setDuration(durationMs: number) {
    this.commit({ totalMs: durationMs })
  }

  async play(): Promise<void> {
    await this.audio.play()
    this.read()
  }

  pause(): void {
    this.audio.pause()
    this.read()
  }

  toggle(): Promise<void> | void {
    return this.audio.paused ? this.play() : this.pause()
  }

  setMuted(muted: boolean): void {
    this.audio.muted = muted
    this.read()
  }

  async seek(ms: number): Promise<void> {
    this.audio.currentTime = Math.max(0, Math.min(this.current.totalMs, ms)) / 1000
    this.read()
  }

  private read = () => {
    const elapsedMs = Math.max(0, this.audio.currentTime * 1000 || 0)
    const measured = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : this.current.totalMs
    this.commit({
      playing: !this.audio.paused && !this.audio.ended,
      muted: this.audio.muted,
      elapsedMs,
      totalMs: measured,
      progress: measured > 0 ? Math.min(1, elapsedMs / measured) : 0,
    })
  }

  private commit(change: Partial<DeckState>) {
    this.current = { ...this.current, ...change }
    this.dispatchEvent(new CustomEvent('change', { detail: this.current }))
  }
}

export class SegnaviaImage extends HTMLElement {
  private value: Media | null = null
  private source = ''
  readonly image = document.createElement('img')

  constructor() {
    super()
    upgradeProperties(this)
    this.image.part.add('image')
    this.append(this.image)
  }

  get media(): Media | null {
    return this.value
  }

  set media(value: Media | null) {
    this.value = value
    if (value) {
      this.style.setProperty('--segnavia-media-aspect', `${value.size.width} / ${value.size.height}`)
      this.image.alt = value.alt?.text ?? ''
      this.image.dir = value.alt ? value.alt.dir ?? 'auto' : ''
    } else this.style.removeProperty('--segnavia-media-aspect')
  }

  get src(): string {
    return this.source
  }

  set src(value: string) {
    this.source = value
    this.image.src = value
  }
}

export class SegnaviaSound extends HTMLElement {
  private value: Sound | null = null
  private source = ''
  readonly audio = document.createElement('audio')
  readonly controller = new AudioPlayback(this.audio)

  constructor() {
    super()
    upgradeProperties(this)
    this.audio.preload = 'none'
    this.audio.part.add('audio')
    this.append(this.audio)
  }

  get sound(): Sound | null {
    return this.value
  }

  set sound(value: Sound | null) {
    this.value = value
    this.controller.setDuration(value?.durationMs ?? 0)
  }

  get src(): string {
    return this.source
  }

  set src(value: string) {
    this.source = value
    this.audio.src = value
  }
}
