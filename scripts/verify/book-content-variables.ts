import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { compact, pagesText } from './book-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const topics = ['Three Phases', 'Practice', 'Questioning']
const parentRules = [
  { when: { position: 'sectionFirst' as const }, parent: 'topic-opener' },
  { when: { face: 'verso' as const }, parent: 'topic-verso' },
  { parent: 'topic-recto' },
]

function fixture(mode: 'continuous' | 'paginated'): DocumentInput {
  const head = '<div>HEAD[<span data-motif="segnavia:head-template" data-motif-name="topic-head"></span>]</div>'
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Content variable verification' },
    mode,
    page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 16, inlineEnd: 16 } },
    variables: [{ type: 'variable', name: 'topic', kind: 'text', from: 'content', pick: 'first' }],
    headTemplates: [{ type: 'headTemplate', name: 'topic-head', parts: [{ variable: 'topic' }] }],
    parentPages: (['opener', 'recto', 'verso'] as const).map((role) => ({
      type: 'parentPage' as const,
      name: `topic-${role}`,
      basedOn: `segnavia:${role}`,
      regions: { head: { edge: 'blockStart' as const, html: head } },
    })),
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            id: 'content-variable-section',
            title: 'Fundamentals of Teaching',
            parentRules,
            children: [
              {
                type: 'flow',
                html: topics
                  .map(
                    (topic, index) =>
                      `<div${index === 0 ? '' : ' style="break-before:page"'}><h2 data-variable="topic">${topic}</h2><p>${'Teaching text. '.repeat(80)}</p></div>`,
                  )
                  .join(''),
              },
            ],
          },
        ],
      },
    ],
  }
}

function heads(file: string): string[] {
  return pagesText(file).map((page) => compact(page).match(/HEAD\[([^\]]*)\]/)?.[1] ?? '')
}

export async function verifyContinuousContentVariables(renderer: Renderer, work: string, check: Check): Promise<void> {
  const found: Partial<Record<'continuous' | 'paginated', string[]>> = {}
  for (const mode of ['continuous', 'paginated'] as const) {
    const bytes = await renderer.bookPdf(fixture(mode), { effects: false, css: 'body{font:12px/16px serif}h2{margin-block:0 8px}' })
    const file = path.join(work, `book-content-variables-${mode}.pdf`)
    writeFileSync(file, bytes)
    found[mode] = heads(file)
  }
  const expected = topics.map(compact)
  check(
    'continuous content-variable heads match paginated heads',
    JSON.stringify(found.continuous) === JSON.stringify(expected) && JSON.stringify(found.continuous) === JSON.stringify(found.paginated),
    JSON.stringify(found),
  )
}
