import type { Sound } from '@segnavia/format'
import type { Playback, PlaybackState } from './playback.ts'
import type { SoundPlayDetail } from './sound-play.ts'

export interface PlayerSoundElement {
  sound: Sound | null
  src: string
  controller: Playback
}

export class PlayerSoundPlayback {
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
    this.sound.sound = event.detail.sound
    this.sound.src = event.detail.src
    void this.sound.controller.play()
  }

  deckChanged(state: Pick<PlaybackState, 'playing'>): void {
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
