import type { Lexicon } from '@segnavia/format'
import type { PronunciationDictionary } from './index.ts'

type RuleBase = {
  string_to_replace: string
  case_sensitive: boolean
  word_boundaries: true
}

type AliasRule = RuleBase & {
  type: 'alias'
  alias: string
}

type PhonemeRule = RuleBase & {
  type: 'phoneme'
  phoneme: string
  alphabet: 'ipa'
}

function refuseCaseInsensitiveCollisions(lexicon: Lexicon): void {
  const terms = new Map<string, string>()
  for (const entry of lexicon.entries) {
    const folded = entry.term.toLocaleLowerCase()
    const previous = terms.get(folded)
    if (previous !== undefined) {
      throw new Error(
        `The terms ${JSON.stringify(previous)} and ${JSON.stringify(entry.term)} collide when caseSensitive is false. Set caseSensitive to true or remove one entry.`,
      )
    }
    terms.set(folded, entry.term)
  }
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
  if (!caseSensitive) refuseCaseInsensitiveCollisions(options.lexicon)
  const rules: (AliasRule | PhonemeRule)[] = options.lexicon.entries.map((entry) => {
    const shared: RuleBase = { string_to_replace: entry.term, case_sensitive: caseSensitive, word_boundaries: true }
    return options.phonemes === true && entry.ipa !== undefined
      ? {
          ...shared,
          type: 'phoneme',
          phoneme: entry.ipa,
          alphabet: 'ipa',
        }
      : { ...shared, type: 'alias', alias: entry.say }
  })
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
