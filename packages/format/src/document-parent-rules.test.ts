import { expect, test } from 'bun:test'
import { Document } from './document.ts'
import { bookFromDocument } from './document-lowering.ts'

function expectRenameIssue(input: Record<string, unknown>, path: (string | number)[], message: string): void {
  const result = Document.safeParse(input)
  expect(result.success).toBe(false)
  if (result.success) return
  const error = result.error as { issues: Array<{ path: (string | number)[]; message: string }> }
  expect(error.issues).toContainEqual(expect.objectContaining({ path, message }))
}

const bookDocument = (overrides: Record<string, unknown>) => ({
  type: 'document',
  kind: 'book',
  title: 'Book',
  mode: 'continuous',
  children: [{ type: 'section', title: 'One', children: [{ type: 'flow', html: '<p>One</p>' }] }],
  ...overrides,
})

test('lowers root book parentRules', () => {
  const parentRules = [{ parent: 'segnavia:recto' }]
  const document = Document.parse({
    type: 'document',
    kind: 'book',
    title: 'Book',
    mode: 'continuous',
    parentRules,
    children: [{ type: 'section', title: 'One', children: [{ type: 'flow', html: '<p>One</p>' }] }],
  })
  expect(bookFromDocument(document).parentRules).toEqual(parentRules)
})

test('refuses parentRules on a template used by a record', () => {
  expect(() =>
    Document.parse({
      type: 'document',
      kind: 'printed',
      parentRules: [{ parent: 'body' }],
      parentPages: [{ type: 'parentPage', name: 'body' }],
      templates: [
        {
          type: 'template',
          name: 'record',
          html: '<p data-slot-value="name"></p>',
          parentRules: [{ parent: 'body' }],
          slots: [{ key: 'name', label: 'Name', type: 'text' }],
        },
      ],
      children: [{ type: 'record', template: 'record', values: { name: 'Ada' } }],
    }),
  ).toThrow("remove its parentRules because record pages use the document's parent rules, to clear this refusal")
})

// vacuity-allow: expectRenameIssue asserts the exact issue path and message.
test('refuses the renamed document rules field', () => {
  expectRenameIssue(bookDocument({ rules: { every: 'body' } }), ['rules'], 'document field rules was renamed; use parentRules instead to clear this refusal')
})

// vacuity-allow: expectRenameIssue asserts the exact issue path and message.
test('refuses the renamed template parents field', () => {
  expectRenameIssue(
    bookDocument({ templates: [{ type: 'template', name: 'page', html: '<main></main>', parents: { recto: 'body' } }] }),
    ['templates', 0, 'parents'],
    'template field parents was renamed; use parentRules instead to clear this refusal',
  )
})

// vacuity-allow: expectRenameIssue asserts each exact issue path and message.
test('refuses renamed parents fields on document nodes', () => {
  for (const [node, path, field] of [
    [{ type: 'section', title: 'One', parents: { recto: 'body' }, children: [{ type: 'flow', html: '<p>One</p>' }] }, ['children', 0, 'parents'], 'section'],
    [{ type: 'contents', title: 'Contents', parents: { recto: 'body' } }, ['children', 0, 'parents'], 'contents'],
    [
      { type: 'part', name: 'one', parents: { recto: 'body' }, children: [{ type: 'section', children: [{ type: 'flow', html: '<p>One</p>' }] }] },
      ['children', 0, 'parents'],
      'part',
    ],
  ] as const) {
    expectRenameIssue(bookDocument({ children: [node] }), [...path], `${field} field parents was renamed; use parentRules instead to clear this refusal`)
  }
})
