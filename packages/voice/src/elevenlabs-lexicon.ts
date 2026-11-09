import type { Lexicon } from '@segnavia/format'
import type { PronunciationDictionary } from './index.ts'

type AliasRule = {
  type: 'alias'
  string_to_replace: string
  alias: string
  case_sensitive: boolean
  word_boundaries: true
}

type PhonemeRule = {
  type: 'phoneme'
  string_to_replace: string
  phoneme: string
  alphabet: 'ipa'
  case_sensitive: boolean
  word_boundaries: true
}

export async function publishElevenLabsLexicon(options: {
  apiKey: () => string
  lexicon: Lexicon
  name: string
  description?: string
  dictionaryId?: string
  phonemes?: boolean
  caseSensitive?: boolean
  signal?: AbortSignal
}): Promise<PronunciationDictionary | null> {
  if (options.lexicon.entries.length === 0 && options.dictionaryId === undefined) return null

  const caseSensitive = options.caseSensitive ?? true
  const rules: (AliasRule | PhonemeRule)[] = options.lexicon.entries.map((entry) =>
    options.phonemes === true && entry.ipa !== undefined
      ? {
          type: 'phoneme',
          string_to_replace: entry.term,
          phoneme: entry.ipa,
          alphabet: 'ipa',
          case_sensitive: caseSensitive,
          word_boundaries: true,
        }
      : { type: 'alias', string_to_replace: entry.term, alias: entry.say, case_sensitive: caseSensitive, word_boundaries: true },
  )
  const updating = options.dictionaryId !== undefined
  const path = updating ? `pronunciation-dictionaries/${encodeURIComponent(options.dictionaryId ?? '')}/set-rules` : 'pronunciation-dictionaries/add-from-rules'
  const response = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
    method: 'POST',
    signal: options.signal,
    headers: { 'xi-api-key': options.apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(
      updating ? { rules } : { name: options.name, ...(options.description === undefined ? {} : { description: options.description }), rules },
    ),
  })
  if (!response.ok) throw new Error(`ElevenLabs refused the pronunciation dictionary: ${response.status} ${await response.text()}`)
  const body = (await response.json()) as { id: string; version_id: string }
  return { id: body.id, versionId: body.version_id }
}
