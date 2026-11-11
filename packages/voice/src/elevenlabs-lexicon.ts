import type { Lexicon } from '@segnavia/format'
import type { PronunciationDictionary } from './index.ts'
import { longestTermsFirst } from './lexicon-order.ts'
import { LexiconRefusedError } from './lexicon-refusal.ts'

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1/'

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

async function dictionaryRequest(options: {
  apiKey: () => string
  path: string
  method: 'PATCH' | 'POST'
  body: unknown
  signal?: AbortSignal
}): Promise<Response> {
  const response = await fetch(`${ELEVENLABS_API}${options.path}`, {
    method: options.method,
    signal: options.signal,
    headers: { 'xi-api-key': options.apiKey(), 'content-type': 'application/json' },
    body: JSON.stringify(options.body),
  })
  if (!response.ok) throw new LexiconRefusedError(response.status, await response.text())
  return response
}

async function dictionaryReply(response: Response): Promise<PronunciationDictionary> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new LexiconRefusedError(response.status, 'the reply named no dictionary id')
  }
  if (body === null || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || body.id.length === 0) {
    throw new LexiconRefusedError(response.status, 'the reply named no dictionary id')
  }
  const versionId = 'version_id' in body && typeof body.version_id === 'string' ? body.version_id : undefined
  return { id: body.id, versionId }
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
  const rules: (AliasRule | PhonemeRule)[] = longestTermsFirst(options.lexicon.entries).map((entry) => {
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
  const response = await dictionaryRequest({
    apiKey: options.apiKey,
    path,
    method: 'POST',
    signal: options.signal,
    body: updating ? { rules } : { name: options.name, ...(options.description === undefined ? {} : { description: options.description }), rules },
  })
  return dictionaryReply(response)
}

export async function archiveElevenLabsLexicon(options: { apiKey: () => string; dictionaryId: string; signal?: AbortSignal }): Promise<void> {
  await dictionaryRequest({
    apiKey: options.apiKey,
    path: `pronunciation-dictionaries/${encodeURIComponent(options.dictionaryId)}`,
    method: 'PATCH',
    signal: options.signal,
    body: { archived: true },
  })
}
