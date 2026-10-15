import type { Lexicon } from '@segnavia/format'
import type { PronunciationDictionary } from './index.ts'

type AliasRule = {
  type: 'alias'
  string_to_replace: string
  alias: string
  case_sensitive: true
  word_boundary: true
}

type PhonemeRule = {
  type: 'phoneme'
  string_to_replace: string
  phoneme: string
  alphabet: 'ipa'
  case_sensitive: true
  word_boundary: true
}

export async function publishElevenLabsLexicon(options: {
  apiKey: () => string
  lexicon: Lexicon
  name: string
  description?: string
  dictionaryId?: string
  phonemes?: boolean
}): Promise<PronunciationDictionary | null> {
  if (options.lexicon.entries.length === 0 && options.dictionaryId === undefined) return null

  const rules: (AliasRule | PhonemeRule)[] = options.lexicon.entries.map((entry) =>
    options.phonemes === true && entry.ipa !== undefined
      ? {
          type: 'phoneme',
          string_to_replace: entry.term,
          phoneme: entry.ipa,
          alphabet: 'ipa',
          case_sensitive: true,
          word_boundary: true,
        }
      : { type: 'alias', string_to_replace: entry.term, alias: entry.say, case_sensitive: true, word_boundary: true },
  )
  const updating = options.dictionaryId !== undefined
  const path = updating ? `pronunciation-dictionaries/${encodeURIComponent(options.dictionaryId ?? '')}/set-rules` : 'pronunciation-dictionaries/add-from-rules'
  const response = await fetch(`https://api.elevenlabs.io/v1/${path}`, {
    method: 'POST',
    headers: { 'xi-api-key': options.apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(
      updating ? { rules } : { name: options.name, ...(options.description === undefined ? {} : { description: options.description }), rules },
    ),
  })
  if (!response.ok) throw new Error(`ElevenLabs refused the pronunciation dictionary: ${response.status} ${await response.text()}`)
  const body = (await response.json()) as { id: string; version_id: string }
  return { id: body.id, versionId: body.version_id }
}
