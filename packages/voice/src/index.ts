// Turns narration text into words with timings, and optionally audio. A
// provider is the only part that knows a speech service; the cache keys a
// result by provider, voice and text, so editing one slide's narration
// re-synthesizes that slide and nothing else.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Word } from '@segnavia/format'

export interface Speech {
  words: Word[]
  durationMs: number
  audio: { bytes: Uint8Array; extension: string } | null
}

export interface VoiceProvider {
  id: string
  synthesize(text: string, voice?: string): Promise<Speech>
}

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

// Characters with start and end times (what ElevenLabs returns) folded into
// words: a word runs from its first character's start to its last one's end.
export function wordsFromCharacters(characters: string[], startsSec: number[], endsSec: number[]): Word[] {
  const words: Word[] = []
  let current: Word | null = null
  characters.forEach((character, index) => {
    const start = Math.round((startsSec[index] ?? 0) * 1000)
    const end = Math.round((endsSec[index] ?? 0) * 1000)
    if (/\s/.test(character)) {
      if (current) words.push(current)
      current = null
      return
    }
    if (current) {
      current.text += character
      current.endMs = end
    } else {
      current = { text: character, startMs: start, endMs: end }
    }
  })
  if (current) words.push(current)
  return words
}

// Sentence and clause ends in Latin, Hebrew (sof pasuk) and Arabic script.
const SENTENCE_END = /[.!?\u05C3\u061F\u06D4\u0964]["'\u05F4\u201D)]*$/u
const CLAUSE_END = /[,;:\u060C\u061B\u05C0]["'\u05F4\u201D)]*$/u

// Timings from a speaking rate, with no audio: deterministic, offline, and
// enough to drive a player and prove the sync. Longer words take longer, and
// a sentence end adds a pause.
export function pacedProvider(options: { wordsPerMinute?: number } = {}): VoiceProvider {
  const msPerChar = 60000 / ((options.wordsPerMinute ?? 160) * 5.5)
  return {
    id: `paced-${options.wordsPerMinute ?? 160}`,
    async synthesize(text) {
      let clock = 0
      const words = splitWords(text).map((word) => {
        const startMs = clock
        const endMs = startMs + Math.max(140, word.length * msPerChar)
        clock = endMs + (SENTENCE_END.test(word) ? 350 : CLAUSE_END.test(word) ? 150 : 60)
        return { text: word, startMs: Math.round(startMs), endMs: Math.round(endMs) }
      })
      return { words, durationMs: Math.round(clock + 400), audio: null }
    },
  }
}

// The key is read when a synthesis runs, never when the module loads, and is
// never written anywhere.
export function elevenLabsProvider(options: { apiKey: () => string; voice: string; model?: string }): VoiceProvider {
  return {
    id: `elevenlabs-${options.model ?? 'eleven_multilingual_v2'}-${options.voice}`,
    async synthesize(text, voice = options.voice) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`, {
        method: 'POST',
        headers: { 'xi-api-key': options.apiKey(), 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: options.model ?? 'eleven_multilingual_v2' }),
      })
      if (!response.ok) throw new Error(`ElevenLabs refused the synthesis: ${response.status} ${await response.text()}`)
      const body = (await response.json()) as {
        audio_base64: string
        alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }
      }
      const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = body.alignment
      const words = wordsFromCharacters(characters, starts, ends)
      return { words, durationMs: Math.round((ends.at(-1) ?? 0) * 1000) + 300, audio: { bytes: Buffer.from(body.audio_base64, 'base64'), extension: 'mp3' } }
    },
  }
}

// Any engine that makes audio, paired with any aligner that finds where each
// word falls in it: a local voice with a forced aligner, or a hosted voice
// without timestamps. Both halves are the host's.
export function alignedProvider(options: {
  id: string
  speak: (text: string, voice?: string) => Promise<{ bytes: Uint8Array; extension: string; durationMs: number }>
  align: (audio: Uint8Array, text: string) => Promise<Word[]>
}): VoiceProvider {
  return {
    id: options.id,
    async synthesize(text, voice) {
      const audio = await options.speak(text, voice)
      const words = await options.align(audio.bytes, text)
      const expected = splitWords(text).length
      if (words.length !== expected) throw new Error(`The aligner placed ${words.length} words; the narration has ${expected}.`)
      return { words, durationMs: audio.durationMs, audio: { bytes: audio.bytes, extension: audio.extension } }
    },
  }
}

export interface Narrated {
  words: Word[]
  durationMs: number
  audio: string | null
}

export async function narrate(provider: VoiceProvider, text: string, options: { cacheDirectory: string; voice?: string }): Promise<Narrated> {
  const hash = createHash('sha256')
    .update(JSON.stringify([provider.id, options.voice ?? null, text]))
    .digest('hex')
    .slice(0, 16)
  mkdirSync(options.cacheDirectory, { recursive: true })
  const timings = path.join(options.cacheDirectory, `${hash}.json`)
  if (existsSync(timings)) return JSON.parse(readFileSync(timings, 'utf8')) as Narrated
  const speech = await provider.synthesize(text, options.voice)
  let audio: string | null = null
  if (speech.audio) {
    audio = `${hash}.${speech.audio.extension}`
    writeFileSync(path.join(options.cacheDirectory, audio), speech.audio.bytes)
  }
  const narrated = { words: speech.words, durationMs: speech.durationMs, audio }
  writeFileSync(timings, JSON.stringify(narrated))
  return narrated
}
