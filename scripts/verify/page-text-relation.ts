import { pointMultiset, unpointed } from './hebrew-text.ts'

export interface PdfGrapheme {
  text: string
  word: number
}

export interface PdfPageText {
  text: string
  graphemes: PdfGrapheme[]
}

export interface PageTextRelation {
  matches: boolean
  skipped: string[]
  excessPoints: string
}

export const MAX_SKIPPED_GRAPHEMES = 3

export const graphemes = (value: string): string[] =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(({ segment }) => segment)

function skippedInLastWord(pdf: PdfGrapheme[], path: number[]): number {
  const last = path.at(-1)
  if (last === undefined) return 0
  const word = pdf[last]?.word
  let skipped = 0
  const matched = new Set(path)
  for (let index = last; index >= 0 && pdf[index]?.word === word; index--) {
    if (!matched.has(index)) skipped++
  }
  return skipped
}

function matchingSuccessors(pdf: PdfGrapheme[], previous: number, path: number[], target: string): number[] {
  const successors: number[] = []
  let word = pdf[previous]?.word
  let skipped = skippedInLastWord(pdf, path)
  for (let index = previous + 1; index < pdf.length; index++) {
    const unit = pdf[index]
    if (!unit) continue
    if (unit.word !== word) {
      word = unit.word
      skipped = 0
    }
    if (unit.text === target) successors.push(index)
    skipped++
    if (skipped > MAX_SKIPPED_GRAPHEMES) break
  }
  return successors
}

function skippedWords(pdf: PdfGrapheme[], path: number[]): string[] {
  const matched = new Set(path)
  const skipped = new Map<number, string[]>()
  for (let index = 0; index < pdf.length; index++) {
    const unit = pdf[index]
    if (!unit || matched.has(index)) continue
    const word = skipped.get(unit.word) ?? []
    word.push(unit.text)
    skipped.set(unit.word, word)
  }
  return [...skipped.values()].map((word) => word.join(''))
}

function boundedSubsequencePath(screen: string[], pdf: PdfGrapheme[]): number[] | undefined {
  if (screen.length === 0) return skippedWords(pdf, []).every((word) => graphemes(word).length <= MAX_SKIPPED_GRAPHEMES) ? [] : undefined
  let reachable = new Map<number, number[]>()
  for (const index of matchingSuccessors(pdf, -1, [], screen[0] ?? '')) reachable.set(index, [index])
  for (let screenIndex = 1; screenIndex < screen.length && reachable.size > 0; screenIndex++) {
    const next = new Map<number, number[]>()
    for (const [previous, path] of reachable) {
      for (const index of matchingSuccessors(pdf, previous, path, screen[screenIndex] ?? '')) {
        const candidate = [...path, index]
        const existing = next.get(index)
        if (!existing || skippedInLastWord(pdf, candidate) < skippedInLastWord(pdf, existing)) next.set(index, candidate)
      }
    }
    reachable = next
  }
  return [...reachable.values()].find((path) => skippedWords(pdf, path).every((word) => graphemes(word).length <= MAX_SKIPPED_GRAPHEMES))
}

function pointExcess(screenText: string, pdfText: string): { contained: boolean; excess: string } {
  const screenPoints = pointMultiset(screenText)
  const excessPoints = [...pointMultiset(pdfText)]
  for (const point of screenPoints) {
    const index = excessPoints.indexOf(point)
    if (index >= 0) excessPoints.splice(index, 1)
    else return { contained: false, excess: excessPoints.join('') }
  }
  return { contained: true, excess: excessPoints.join('') }
}

export function pageTextRelation(screenText: string, pdfPage: PdfPageText): PageTextRelation {
  const screen = graphemes(unpointed(screenText))
  const path = boundedSubsequencePath(screen, pdfPage.graphemes)
  const points = pointExcess(screenText, pdfPage.text)
  if (!path || !points.contained) return { matches: false, skipped: [], excessPoints: points.excess }
  return { matches: true, skipped: skippedWords(pdfPage.graphemes, path), excessPoints: points.excess }
}
