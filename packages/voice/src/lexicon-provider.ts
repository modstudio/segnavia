import { type Lexicon, lexiconVersion } from '@segnavia/format'
import { remapCaptionWords } from './captions.ts'
import type { VoiceProvider } from './index.ts'

const WORD_CHARACTER = '[\\p{L}\\p{N}\\p{M}_]'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function respell(text: string, lexicon: Lexicon): string {
  if (lexicon.entries.length === 0) return text
  const replacements = new Map(lexicon.entries.map((entry) => [entry.term, entry.say]))
  const alternatives = [...replacements.keys()]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|')
  const terms = new RegExp(`(?<!${WORD_CHARACTER})(?:${alternatives})(?!${WORD_CHARACTER})`, 'gu')
  return text.replace(terms, (term) => replacements.get(term) ?? term)
}

export function lexiconProvider(inner: VoiceProvider, lexicon: Lexicon): VoiceProvider {
  const entries = lexicon.entries.map((entry) => ({ ...entry }))
  const fixedLexicon = { entries }
  return {
    id: `${inner.id}-lexicon-${lexiconVersion(fixedLexicon)}`,
    async synthesize(text, voice) {
      const speech = await inner.synthesize(respell(text, fixedLexicon), voice)
      return { ...speech, words: remapCaptionWords(speech.words, text) }
    },
  }
}
