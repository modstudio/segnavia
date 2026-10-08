// What drives a playing slide, as the word being spoken. Recorded audio and a
// paced timing read the word from elapsed time; live speech reads it from the
// engine as it speaks, so it needs no timings in advance.

import type { Narration } from '@segnavia/format'
import { wordAt, wordAtOffset, wordOffsets } from './timeline.ts'

export interface Clock {
  word(): number | null
  ended(): boolean
  // How far the narration has run, from 0 to 1.
  progress(): number
  stop(): void
}

export function timedClock(narration: Narration, audioSrc: string | null): Clock {
  const started = performance.now()
  const elapsed = () => performance.now() - started
  if (!audioSrc) {
    return {
      word: () => wordAt(narration, elapsed()),
      ended: () => elapsed() >= narration.durationMs,
      progress: () => Math.min(1, elapsed() / narration.durationMs),
      stop: () => {},
    }
  }
  const audio = new Audio(audioSrc)
  // Until the audio is actually playing, and for good if the browser refuses
  // to play it, the narration's own timing drives the slide so it still
  // advances and its cues still fire.
  let playing = false
  let ended = false
  audio.addEventListener('playing', () => {
    playing = true
  })
  audio.addEventListener('ended', () => {
    ended = true
  })
  void audio.play().catch(() => {})
  const now = () => (playing ? audio.currentTime * 1000 : elapsed())
  return {
    word: () => wordAt(narration, now()),
    ended: () => ended || now() >= narration.durationMs,
    progress: () => (ended ? 1 : Math.min(1, now() / narration.durationMs)),
    stop: () => audio.pause(),
  }
}

// The browser's own voices: no audio file and no timings, which is what a
// draft wants. Quality and timing vary by engine; a deck that ships uses
// recorded narration.
export function speechClock(narration: Narration, voiceName?: string): Clock {
  const synth = window.speechSynthesis
  const offsets = wordOffsets(narration.text)
  const utterance = new SpeechSynthesisUtterance(narration.text)
  if (narration.lang) utterance.lang = narration.lang
  const voice = voiceName ? synth.getVoices().find((candidate) => candidate.name === voiceName) : undefined
  if (voice) utterance.voice = voice
  let word: number | null = null
  let ended = false
  utterance.onboundary = (event) => {
    if (event.name === 'word') word = wordAtOffset(offsets, event.charIndex)
  }
  utterance.onend = () => {
    ended = true
  }
  utterance.onerror = () => {
    ended = true
  }
  synth.cancel()
  synth.speak(utterance)
  return {
    word: () => word,
    ended: () => ended,
    progress: () => (ended ? 1 : word === null ? 0 : (word + 1) / Math.max(1, offsets.length)),
    stop: () => synth.cancel(),
  }
}
