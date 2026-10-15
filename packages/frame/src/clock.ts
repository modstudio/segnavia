// A positionable clock for one whole slide. Recorded audio is authoritative
// while narration plays; pauses around it and unnarrated holds use wall time.

import type { Narration, Slide } from '@segnavia/format'
import { phaseBounds, slideDurationMs, slideStateAt, wordAtOffset, wordOffsets } from './timeline.ts'

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

export function timedClock(slide: Slide, audioSrc: string | null): Clock {
  if (!audioSrc || !slide.narration) return wallClock(slide)
  const narration = slide.narration
  const audio = new Audio(audioSrc)
  const duration = slideDurationMs(slide) ?? 0
  const { beforeMs, narrationEndMs: narrationEnd } = phaseBounds(slide)
  let position = 0
  let anchor = performance.now()
  let running = true
  let audioPlaying = false
  let audioEnded = false
  let mediaEnabled = true
  const playAudio = () => {
    if (running && mediaEnabled) void audio.play().catch(() => {})
  }
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
      if (!audioPlaying) playAudio()
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
    audio.currentTime = Math.max(0, Math.min(narration.durationMs, position - beforeMs)) / 1000
    if (!running || position < beforeMs || position >= narrationEnd) {
      audio.pause()
      audioPlaying = false
      return
    }
    playAudio()
  }
  const clock: Clock = {
    word: () => slideStateAt(slide, elapsed()).word,
    ended: () => elapsed() >= duration,
    elapsed,
    progress: () => (duration === 0 ? 1 : elapsed() / duration),
    pause: () => {
      mediaEnabled = false
      position = elapsed()
      mediaEnabled = true
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
  return clock
}

// Browser speech cannot seek or change volume mid-utterance. Muting cancels
// it and leaves the declared slide timing to pace the remainder.
export function speechClock(slide: Slide, voiceName?: string): Clock {
  const narration = slide.narration as Narration
  const synth = window.speechSynthesis
  const offsets = wordOffsets(narration.text)
  const duration = slideDurationMs(slide) ?? 0
  const { beforeMs, narrationEndMs: narrationEnd } = phaseBounds(slide)
  const utterance = new SpeechSynthesisUtterance(narration.text)
  if (narration.lang) utterance.lang = narration.lang
  const voice = voiceName ? synth.getVoices().find((candidate) => candidate.name === voiceName) : undefined
  if (voice) utterance.voice = voice
  let spokenWord: number | null = null
  let position = 0
  let anchor = performance.now()
  let running = true
  let speaking = false
  let speechDone = false
  let muted = false
  let abandoned = false
  utterance.onboundary = (event) => {
    if (event.name === 'word') spokenWord = wordAtOffset(offsets, event.charIndex)
  }
  const finishSpeech = () => {
    speechDone = true
    position = narrationEnd
    anchor = performance.now()
  }
  utterance.onend = finishSpeech
  utterance.onerror = finishSpeech
  const begin = () => {
    if (!running || speaking || abandoned) return
    speaking = true
    synth.cancel()
    synth.speak(utterance)
  }
  const elapsed = () => {
    if (!running) return position
    const wall = position + performance.now() - anchor
    if (position < beforeMs && wall >= beforeMs) {
      position = beforeMs
      anchor = performance.now()
      begin()
      return position
    }
    if (!abandoned && !speechDone && position >= beforeMs) return Math.min(narrationEnd, wall)
    return Math.min(duration, wall)
  }
  return {
    word: () => {
      const now = elapsed()
      if (!speaking && now >= beforeMs) begin()
      return abandoned ? slideStateAt(slide, now).word : spokenWord
    },
    ended: () => (abandoned || speechDone) && elapsed() >= duration,
    elapsed,
    progress: () => (duration === 0 ? (speechDone ? 1 : 0) : elapsed() / duration),
    pause: () => {
      position = elapsed()
      running = false
      if (speaking && !abandoned) synth.pause()
    },
    resume: () => {
      if (running) return
      anchor = performance.now()
      running = true
      if (speaking && !abandoned) synth.resume()
      else if (position >= beforeMs) begin()
    },
    seek: () => {
      synth.cancel()
      speaking = false
      speechDone = false
      spokenWord = null
      position = 0
      anchor = performance.now()
    },
    get muted() {
      return muted
    },
    set muted(value) {
      muted = value
      if (!value || abandoned) return
      position = elapsed()
      anchor = performance.now()
      abandoned = true
      synth.cancel()
    },
    stop: () => {
      position = elapsed()
      running = false
      synth.cancel()
    },
  }
}
