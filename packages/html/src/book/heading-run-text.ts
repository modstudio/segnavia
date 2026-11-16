import { type Direction, type RunText } from '@segnavia/format'
import { type ChildNode, type Element, isTag, isText } from 'domhandler'
import { headingText, hiddenHeadingNode } from './dom.ts'

interface HeadingRun {
  text: string
  lang?: string
  dir?: Direction
}

function authoredDirection(value: string | undefined, inherited: Direction | undefined): Direction | undefined {
  return value === 'ltr' || value === 'rtl' || value === 'auto' ? value : inherited
}

function collectHeadingRuns(node: ChildNode, runs: HeadingRun[], lang?: string, dir?: Direction): void {
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
  for (const child of node.children) collectHeadingRuns(child, runs, ownLang, ownDir)
}

export function headingRunText(heading: Element): RunText {
  const plain = headingText(heading).replace(/\s+/g, ' ').trim()
  const runs: HeadingRun[] = []
  collectHeadingRuns(heading, runs)
  if (!runs.some((run) => run.lang !== undefined || run.dir !== undefined)) return plain
  const normalized = runs.map((run) => ({ ...run, text: run.text.replace(/\s+/g, ' ') })).filter((run) => run.text !== '')
  const first = normalized[0]
  const last = normalized.at(-1)
  if (first) first.text = first.text.trimStart()
  if (last) last.text = last.text.trimEnd()
  return normalized.filter((run) => run.text !== '')
}
