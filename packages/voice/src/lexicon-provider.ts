import { type Lexicon, lexiconVersion } from '@segnavia/format'
import { remapCaptionWords } from './captions.ts'
import type { InlineIpaForm, VoiceProvider } from './index.ts'
import { longestTermsFirst } from './lexicon-order.ts'

const WORD_CHARACTER = '[\\p{L}\\p{N}\\p{M}_]'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function inlineReading(term: string, say: string, ipa: string | undefined, form: InlineIpaForm | undefined): string {
  if (ipa === undefined || form === undefined) return say
  return form === 'phoneme-tag' ? `<phoneme alphabet="ipa" ph="${ipa}">${term}</phoneme>` : `/${ipa}/`
}

function respell(text: string, lexicon: Lexicon, inlineIpa?: InlineIpaForm): { text: string; captionWords: string[] } {
  const scriptWords = [...text.matchAll(/\S+/gu)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }))
  if (lexicon.entries.length === 0) return { text, captionWords: scriptWords.map((word) => word.text) }
  const replacements = new Map(longestTermsFirst(lexicon.entries).map((entry) => [entry.term, inlineReading(entry.term, entry.say, entry.ipa, inlineIpa)]))
  const alternatives = [...replacements.keys()].map(escapeRegExp).join('|')
  const terms = new RegExp(`(?<!${WORD_CHARACTER})(?:${alternatives})(?!${WORD_CHARACTER})`, 'gu')
  const wordBoundaries = new Set(scriptWords.slice(1).map((_word, index) => index + 1))
  const respelled = text.replace(terms, (term, offset: number) => {
    const lastOffset = offset + term.length
    const matchedWords = scriptWords.map((word, index) => ({ word, index })).filter(({ word }) => word.start < lastOffset && word.end > offset)
    const first = matchedWords[0]?.index
    const last = matchedWords.at(-1)?.index
    if (first !== undefined && last !== undefined) {
      for (let boundary = first + 1; boundary <= last; boundary++) wordBoundaries.delete(boundary)
    }
    return replacements.get(term) ?? term
  })
  const captionWords: string[] = []
  let group: string[] = []
  scriptWords.forEach((word, index) => {
    if (wordBoundaries.has(index)) {
      captionWords.push(group.join(' '))
      group = []
    }
    group.push(word.text)
  })
  if (group.length > 0) captionWords.push(group.join(' '))
  return { text: respelled, captionWords }
}

function validateInlineIpa(inner: VoiceProvider, lexicon: Lexicon): InlineIpaForm {
  const form = inner.inlineIpa
  if (form === undefined) {
    throw new Error(
      `provider ${inner.id} declares no inline IPA form; use a model that reads inline IPA (eleven_flash_v2 or eleven_v4) or preview the respelling without phonemes`,
    )
  }
  for (const entry of lexicon.entries) {
    if (entry.ipa === undefined) continue
    if (form === 'phoneme-tag' && entry.term.includes(' ')) {
      throw new Error(`cannot write inline IPA for multi-word term "${entry.term}" as a phoneme tag; split the term or use a provider that reads slashes`)
    }
    if (/[\p{Cc}<>"/]/u.test(entry.ipa)) {
      throw new Error(
        `cannot write inline IPA for term "${entry.term}" because its IPA contains a control character or one of <, >, ", /; remove that character`,
      )
    }
  }
  return form
}

export function lexiconProvider(inner: VoiceProvider, lexicon: Lexicon, options: { phonemes?: boolean } = {}): VoiceProvider {
  const entries = lexicon.entries.map((entry) => ({ ...entry }))
  const fixedLexicon = { entries }
  const inlineIpa = options.phonemes ? validateInlineIpa(inner, fixedLexicon) : undefined
  return {
    id: `${inner.id}-lexicon-${lexiconVersion(fixedLexicon)}${options.phonemes ? '-ipa' : ''}`,
    ...(inner.inlineIpa === undefined ? {} : { inlineIpa: inner.inlineIpa }),
    async synthesize(text, voice, options) {
      const respelling = respell(text, fixedLexicon, inlineIpa)
      const speech = await inner.synthesize(respelling.text, voice, options)
      return { ...speech, words: remapCaptionWords(speech.words, text, respelling.captionWords) }
    },
  }
}
