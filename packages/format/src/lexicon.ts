import { z } from 'zod'

const SingleWord = z.string().min(1).regex(/^\S+$/u)

export const PronunciationEntry = z.object({
  term: SingleWord,
  say: SingleWord,
  ipa: z.string().optional(),
})
export type PronunciationEntry = z.infer<typeof PronunciationEntry>

export const Lexicon = z
  .object({
    entries: z.array(PronunciationEntry),
  })
  .superRefine((lexicon, ctx) => {
    const terms = new Set<string>()
    lexicon.entries.forEach((entry, index) => {
      if (terms.has(entry.term)) {
        ctx.addIssue({ code: 'custom', path: ['entries', index, 'term'], message: `the term ${JSON.stringify(entry.term)} appears more than once` })
      }
      terms.add(entry.term)
    })
  })
export type Lexicon = z.infer<typeof Lexicon>

// Hashing canonical encoded bytes keeps the version portable between browsers
// and servers without making format depend on Node.
export function lexiconVersion(lexicon: Lexicon): string {
  const canonical = [...lexicon.entries]
    .sort((left, right) => (left.term < right.term ? -1 : left.term > right.term ? 1 : 0))
    .map(({ term, say, ipa }) => [term, say, ipa ?? null])
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(JSON.stringify(canonical))) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0').slice(0, 12)
}
