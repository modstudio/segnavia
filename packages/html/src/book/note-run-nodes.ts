import { type Book, plainText, resolveDirection } from '@segnavia/format'
import type { ChildNode } from 'domhandler'
import { element } from './dom.ts'
import type { CollectedNotes } from './notes.ts'
import { runTextNodes } from './run-nodes.ts'

export function noteRunNodes(book: Book, notes: CollectedNotes): ChildNode[] {
  let groupKey: string | undefined
  return notes.runs.flatMap((run) => {
    const groupHeading = run.groupKey !== undefined && run.groupKey !== groupKey ? run.groupHeading : undefined
    groupKey = run.groupKey
    return [
      ...(groupHeading === undefined
        ? []
        : [element('p', { class: 'segnavia-notes-scope', dir: resolveDirection(book.dir, book.lang, plainText(groupHeading)) }, runTextNodes(groupHeading))]),
      ...(run.heading === undefined
        ? []
        : [
            element(
              'p',
              {
                class: 'segnavia-notes-scope',
                ...(run.headingScope ? { 'data-segnavia-scope': 'heading' } : {}),
                dir: resolveDirection(book.dir, book.lang, plainText(run.heading)),
              },
              runTextNodes(run.heading),
            ),
          ]),
      ...run.paragraphs,
    ]
  })
}
