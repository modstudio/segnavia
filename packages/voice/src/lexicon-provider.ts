import { type Lexicon, lexiconVersion } from '@segnavia/format'
import { remapCaptionWords } from './captions.ts'
import type { VoiceProvider } from './index.ts'

const WORD_CHARACTER = '[\\p{L}\\p{N}\\p{M}_]'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function respell(text: string, lexicon: Lexicon): { text: string; captionWords: string[] } {
  const scriptWords = [...text.matchAll(/\S+/gu)].map((match) => ({ text: match[0], start: match.index, end: match.index + match[0].length }))
  if (lexicon.entries.length === 0) return { text, captionWords: scriptWords.map((word) => word.text) }
  const replacements = new Map(lexicon.entries.map((entry) => [entry.term, entry.say]))
  const alternatives = [...replacements.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|')
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

export function lexiconProvider(inner: VoiceProvider, lexicon: Lexicon): VoiceProvider {
  const entries = lexicon.entries.map((entry) => ({ ...entry }))
  const fixedLexicon = { entries }
  return {
    id: `${inner.id}-lexicon-${lexiconVersion(fixedLexicon)}`,
    async synthesize(text, voice, options) {
      const respelling = respell(text, fixedLexicon)
      const speech = await inner.synthesize(respelling.text, voice, options)
      return { ...speech, words: remapCaptionWords(speech.words, text, respelling.captionWords) }
    },
  }
}
