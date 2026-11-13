import { applyOps, inverseBatch } from '@segnavia/format'
import { describeDocument } from './describe-document.ts'
import { parseDocument } from './document.ts'
import { editDocument } from './edit-document.ts'

export function editDocumentBookFixture() {
  let next = 1
  const newId = () => `fixture-${++next}`
  const input = parseDocument(
    {
      type: 'document',
      id: 'hebrew-book',
      kind: 'book',
      metadata: { title: 'ספר לדוגמה' },
      mode: 'continuous',
      settings: { dir: 'rtl', lang: 'he' },
      children: [{ type: 'part', id: 'fixture-1', name: 'תוכן', title: 'תוכן', children: [{ type: 'flow', id: 'placeholder', title: 'Placeholder', html: '' }] }],
    },
    { newId },
  )
  const result = editDocument(
    input,
    [
      {
        type: 'add',
        node: {
          type: 'section',
          id: 'section-one',
          title: 'בְּרֵאשִׁית',
          children: [{ type: 'flow', id: 'flow-one', html: '<h1 dir="rtl" lang="he">בְּרֵאשִׁית</h1><p dir="rtl" lang="he">בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים</p>' }],
        },
        at: { parent: { name: 'תוכן' }, index: 0 },
      },
      {
        type: 'add',
        node: {
          type: 'section',
          id: 'section-two',
          title: 'וַיֹּאמֶר',
          children: [{ type: 'flow', id: 'flow-two', html: '<h1 dir="rtl" lang="he">וַיֹּאמֶר</h1><p dir="rtl" lang="he">וַיֹּ֥אמֶר אֱלֹהִ֖ים יְהִ֣י א֑וֹר</p>' }],
        },
        at: { parent: { name: 'תוכן' }, index: 1 },
      },
      { type: 'remove', node: { id: 'placeholder' } },
      { type: 'insertBlock', html: '<p dir="rtl" lang="he">וַיְהִי־אֽוֹר</p>', position: { in: { node: { id: 'flow-two' }, field: 'html' }, at: 'end' } },
      { type: 'moveBlock', block: 'fixture-6', position: { before: 'fixture-4' } },
      { type: 'setStyle', fields: { css: ':root { direction: rtl; }' } },
    ],
    { newId },
  )
  if (!result.ok) throw new Error(result.refusal)
  return {
    input,
    result,
    golden: { document: result.document, description: describeDocument(result.document, { detail: 'full' }) },
    composed: applyOps(input, result.batch),
    restored: applyOps(result.document, inverseBatch(result.batch, result.document)),
  }
}
