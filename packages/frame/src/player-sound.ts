import type { Sound } from '@segnavia/format'
import type { Playback, PlaybackState } from './playback.ts'
import type { SoundPlayDetail } from './sound-play.ts'

export interface PlayerSoundElement {
  sound: Sound | null
  src: string
  controller: Playback
}

export class PlayerSoundPlayback {
  private soundSlide: number | undefined

  constructor(
    private readonly deck: Playback,
    private readonly sound: PlayerSoundElement,
    private readonly visible: (visible: boolean) => void,
  ) {
    sound.controller.addEventListener('change', this.onSoundChange)
  }

  handle = (event: CustomEvent<SoundPlayDetail>) => {
    event.preventDefault()
    this.deck.pause()
    this.soundSlide = this.deck.state.index
    this.sound.sound = event.detail.sound
    this.sound.src = event.detail.src
    void this.sound.controller.play().catch(() => {
      this.soundSlide = undefined
      this.visible(false)
    })
  }

  deckChanged(state: Pick<PlaybackState, 'playing' | 'index'>): void {
    if (this.soundSlide !== undefined && state.index !== this.soundSlide) {
      this.soundSlide = undefined
      this.sound.controller.pause()
      this.visible(false)
      return
    }
    if (state.playing && this.sound.controller.state.playing) this.sound.controller.pause()
  }

  disconnect(): void {
    this.sound.controller.pause()
  }

  private onSoundChange = (event: Event) => {
    const playing = (event as CustomEvent<PlaybackState>).detail.playing
    this.visible(playing)
    if (playing && this.deck.state.playing) this.deck.pause()
  }
}
