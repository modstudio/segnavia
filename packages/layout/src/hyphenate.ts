import { HYPHENATION_EN_US_EXCEPTIONS, HYPHENATION_EN_US_PATTERNS } from './hyphenation-en-us.ts'

interface TrieNode {
  children: Map<string, TrieNode>
  weights?: number[]
}

interface Hyphenator {
  exceptions: Map<string, number[]>
  root: TrieNode
}

type LanguageData = { exceptions: string; patterns: string } | { patterns: null }

const LEFT_MINIMUM = 2
const RIGHT_MINIMUM = 3
const LETTER = /^\p{Letter}$/u

const languageData: Record<string, LanguageData> = {
  en: { exceptions: HYPHENATION_EN_US_EXCEPTIONS, patterns: HYPHENATION_EN_US_PATTERNS },
  he: { patterns: null },
  yi: { patterns: null },
}
const hyphenators = new Map<string, Hyphenator>()

function patternParts(pattern: string): { letters: string; weights: number[] } {
  let letters = ''
  const weights = [0]
  for (const character of pattern) {
    const weight = Number(character)
    if (Number.isInteger(weight)) weights[weights.length - 1] = weight
    else {
      letters += character
      weights.push(0)
    }
  }
  return { letters, weights }
}

function buildTrie(patterns: string): TrieNode {
  const root: TrieNode = { children: new Map() }
  for (const pattern of patterns.trim().split(/\s+/)) {
    const { letters, weights } = patternParts(pattern)
    let node = root
    for (const letter of letters) {
      let child = node.children.get(letter)
      if (!child) {
        child = { children: new Map() }
        node.children.set(letter, child)
      }
      node = child
    }
    node.weights = weights
  }
  return root
}

function exceptionPoints(exception: string): [string, number[]] {
  const parts = exception.split('-')
  const points: number[] = []
  let index = 0
  for (const part of parts.slice(0, -1)) {
    index += part.length
    points.push(index)
  }
  return [parts.join(''), points]
}

function hyphenator(language: string): Hyphenator | undefined {
  const primary = language.toLowerCase().split('-')[0] ?? ''
  const data = languageData[primary]
  if (!data || data.patterns === null) return undefined
  const cached = hyphenators.get(primary)
  if (cached) return cached
  const built = {
    exceptions: new Map(data.exceptions.trim().split(/\s+/).map(exceptionPoints)),
    root: buildTrie(data.patterns),
  }
  hyphenators.set(primary, built)
  return built
}

function patternPoints(word: string, root: TrieNode): number[] {
  const decorated = `.${word}.`
  const scores = Array.from<number>({ length: decorated.length + 1 }).fill(0)
  for (let start = 0; start < decorated.length; start += 1) {
    let node: TrieNode | undefined = root
    for (let index = start; index < decorated.length && node; index += 1) {
      node = node.children.get(decorated[index] as string)
      if (!node?.weights) continue
      for (let offset = 0; offset < node.weights.length; offset += 1) {
        scores[start + offset] = Math.max(scores[start + offset] ?? 0, node.weights[offset] ?? 0)
      }
    }
  }
  return scores.flatMap((score, index) => (score % 2 === 1 && index > LEFT_MINIMUM && index < word.length - RIGHT_MINIMUM + 2 ? [index - 1] : []))
}

function pointsForSegment(word: string, language: string): number[] {
  const built = hyphenator(language)
  if (!built || word.length < LEFT_MINIMUM + RIGHT_MINIMUM) return []
  const normalized = word.toLowerCase()
  return built.exceptions.get(normalized) ?? patternPoints(normalized, built.root)
}

function isMaqafBreak(word: string, index: number): boolean {
  return word[index] === '\u05be' && LETTER.test(word[index - 1] ?? '') && LETTER.test(word[index + 1] ?? '')
}

/**
 * Returns indices at which a word may be broken, without changing the word.
 * A break following U+05BE maqaf inserts no hyphen; every other break does.
 */
export function hyphenationPoints(word: string, language: string): number[] {
  const points: number[] = []
  let segmentStart = 0
  for (let index = 0; index <= word.length; index += 1) {
    if (word[index] !== '\u05be' && index !== word.length) continue
    points.push(...pointsForSegment(word.slice(segmentStart, index), language).map((point) => segmentStart + point))
    if (isMaqafBreak(word, index)) points.push(index + 1)
    segmentStart = index + 1
  }
  return points
}
