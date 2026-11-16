import { type RunText, resolveDirection } from '@segnavia/format'
import type { ChildNode } from 'domhandler'
import { element, text } from './dom.ts'

export function runTextNodes(value: RunText): ChildNode[] {
  if (typeof value === 'string') return [text(value)]
  return value.map((run) => {
    if (run.lang === undefined && run.dir === undefined) return text(run.text)
    return element(
      'span',
      {
        ...(run.lang === undefined ? {} : { lang: run.lang }),
        dir: resolveDirection(run.dir, run.lang, run.text),
      },
      [text(run.text)],
    )
  })
}
