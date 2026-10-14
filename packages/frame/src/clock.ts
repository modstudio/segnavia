// A positionable clock for one whole slide. Recorded audio is authoritative
// while narration plays; pauses around it and unnarrated holds use wall time.

import type { Narration, Slide } from '@segnavia/format'
import { slideDurationMs, slideStateAt, wordAtOffset, wordOffsets } from './timeline.ts'

export interface Clock {
  word(): number | null
  ended(): boolean
  elapsed(): number
  progress(): number
  pause(): void
  resume(): void
  seek(ms: number): void
  muted: boolean
  stop(): void
}

function asSlide(value: Slide | Narration): Slide {
  return 'id' in value ? value : { id: '', content: { kind: 'html', html: '' }, narration: value }
}

function wallClock(slide: Slide): Clock {
  const duration = slideDurationMs(slide) ?? 0
  let position = 0
  let anchor = performance.now()
  let running = true
  let muted = false
  const elapsed = () => Math.min(duration, position + (running ? performance.now() - anchor : 0))
  return {
    word: () => slideStateAt(slide, elapsed()).word,
    ended: () => elapsed() >= duration,
    elapsed,
    progress: () => (duration === 0 ? 1 : elapsed() / duration),
    pause: () => {
      position = elapsed()
      running = false
    },
    resume: () => {
      if (running) return
      anchor = performance.now()
      running = true
    },
    seek: (ms) => {
      position = Math.max(0, Math.min(duration, ms))
      anchor = performance.now()
    },
    get muted() {
      return muted
    },
    set muted(value) {
      muted = value
    },
    stop: () => {
      position = elapsed()
      running = false
    },
  }
}

export function timedClock(value: Slide | Narration, audioSrc: string | null): Clock {
  const slide = asSlide(value)
  if (!audioSrc || !slide.narration) return wallClock(slide)
  const audio = new Audio(audioSrc)
  const duration = slideDurationMs(slide) ?? 0
  const beforeMs = slide.beforeMs ?? 0
  const narrationEnd = beforeMs + slide.narration.durationMs
  let position = 0
  let anchor = performance.now()
  let running = true
  let audioPlaying = false
  let audioEnded = false
  const playAudio = () => void audio.play().catch(() => {})
  audio.addEventListener('playing', () => {
    audioPlaying = true
  })
  audio.addEventListener('ended', () => {
    audioEnded = true
    position = narrationEnd
    anchor = performance.now()
  })
  const elapsed = () => {
    if (!running) return position
    if (position < beforeMs) {
      const wall = position + performance.now() - anchor
      if (wall < beforeMs) return wall
      position = beforeMs
      anchor = performance.now()
      playAudio()
      return position
    }
    if (!audioEnded && position < narrationEnd) {
      const fallback = position + performance.now() - anchor
      const narrationPosition = audioPlaying ? beforeMs + audio.currentTime * 1000 : fallback
      if (narrationPosition < narrationEnd) return narrationPosition
      audioEnded = true
      position = narrationEnd
      anchor = performance.now()
    }
    return Math.min(duration, position + performance.now() - anchor)
  }
  const syncAudio = () => {
    const now = elapsed()
    if (now < beforeMs || now >= narrationEnd) {
      audio.pause()
      return
    }
    audio.currentTime = (now - beforeMs) / 1000
    playAudio()
  }
  const clock: Clock = {
    word: () => slideStateAt(slide, elapsed()).word,
    ended: () => elapsed() >= duration,
    elapsed,
    progress: () => (duration === 0 ? 1 : elapsed() / duration),
    pause: () => {
      position = elapsed()
      running = false
      audio.pause()
    },
    resume: () => {
      if (running) return
      anchor = performance.now()
      running = true
      syncAudio()
    },
    seek: (ms) => {
      position = Math.max(0, Math.min(duration, ms))
      anchor = performance.now()
      audioEnded = position >= narrationEnd
      syncAudio()
    },
    get muted() {
      return audio.muted
    },
    set muted(value) {
      audio.muted = value
    },
    stop: () => {
      position = elapsed()
      running = false
      audio.pause()
    },
  }
  if (beforeMs === 0) playAudio()
  return clock
}

// Browser speech cannot seek or change volume mid-utterance. Muting cancels
// it and leaves the declared slide timing to pace the remainder.
export function speechClock(value: Slide | Narration, voiceName?: string): Clock {
  const slide = asSlide(value)
  const narration = slide.narration as Narration
  const paced = wallClock(slide)
  const synth = window.speechSynthesis
  const offsets = wordOffsets(narration.text)
  const utterance = new SpeechSynthesisUtterance(narration.text)
  if (narration.lang) utterance.lang = narration.lang
  const voice = voiceName ? synth.getVoices().find((candidate) => candidate.name === voiceName) : undefined
  if (voice) utterance.voice = voice
  let spokenWord: number | null = null
  let cancelled = false
  let speaking = false
  utterance.onboundary = (event) => {
    if (event.name === 'word') spokenWord = wordAtOffset(offsets, event.charIndex)
  }
  const begin = () => {
    if (speaking || cancelled) return
    speaking = true
    synth.cancel()
    synth.speak(utterance)
  }
  if ((slide.beforeMs ?? 0) === 0) begin()
  return {
    word: () => {
      if (!speaking && paced.elapsed() >= (slide.beforeMs ?? 0)) begin()
      return cancelled ? slideStateAt(slide, paced.elapsed()).word : spokenWord
    },
    ended: paced.ended,
    elapsed: paced.elapsed,
    progress: paced.progress,
    pause: () => {
      paced.pause()
      if (speaking && !cancelled) synth.pause()
    },
    resume: () => {
      paced.resume()
      if (speaking && !cancelled) synth.resume()
    },
    seek: () => {
      synth.cancel()
      speaking = false
      spokenWord = null
      paced.seek(0)
    },
    get muted() {
      return cancelled
    },
    set muted(value) {
      if (!value || cancelled) return
      cancelled = true
      synth.cancel()
    },
    stop: () => {
      paced.stop()
      synth.cancel()
    },
  }
}
