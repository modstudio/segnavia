import type { Direction, RunText, TextRun } from '@segnavia/format'
import { type ChildNode, type Element, isTag, isText } from 'domhandler'
import { headingTextBlock, hiddenHeadingNode, plainHeadingText } from './dom.ts'

function authoredDirection(value: string | undefined, inherited: Direction | undefined): Direction | undefined {
  return value === 'ltr' || value === 'rtl' || value === 'auto' ? value : inherited
}

function collectHeadingRuns(node: ChildNode, runs: TextRun[], lang?: string, dir?: Direction): void {
  if (isText(node)) {
    if (node.data !== '') runs.push({ text: node.data, lang, dir })
    return
  }
  if (!isTag(node) || hiddenHeadingNode(node)) return
  if (node.name === 'br') {
    runs.push({ text: ' ', lang, dir })
    return
  }
  const ownLang = node.attribs.lang ?? lang
  const ownDir = authoredDirection(node.attribs.dir, dir)
  if (headingTextBlock(node)) runs.push({ text: ' ', lang: ownLang, dir: ownDir })
  for (const child of node.children) collectHeadingRuns(child, runs, ownLang, ownDir)
  if (headingTextBlock(node)) runs.push({ text: ' ', lang: ownLang, dir: ownDir })
}

export function headingRunText(heading: Element): RunText | undefined {
  const plain = plainHeadingText(heading)
  if (plain === '') return undefined
  const runs: TextRun[] = []
  collectHeadingRuns(heading, runs)
  if (!runs.some((run) => run.lang !== undefined || run.dir !== undefined)) return plain
  const normalized: TextRun[] = []
  for (const run of runs) {
    let value = run.text.replace(/\s+/g, ' ')
    if (normalized.length === 0 || normalized.at(-1)?.text.endsWith(' ')) value = value.trimStart()
    if (value !== '') normalized.push({ ...run, text: value })
  }
  const last = normalized.at(-1)
  if (last) last.text = last.text.trimEnd()
  return normalized.filter((run) => run.text !== '')
}
