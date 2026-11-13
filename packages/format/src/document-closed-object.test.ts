import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { Document } from './document.ts'
import { jsonSchemas } from './json-schemas.ts'
import { FillValues } from './slots.ts'

describe('Document closed objects', () => {
  test('refuses unknown keys throughout the document model with their full paths', () => {
    const root = { type: 'document' as const, kind: 'book' as const, title: 'Book', mode: 'continuous' as const }
    const flow = { type: 'flow' as const, html: '<p>Text</p>' }
    const cases = [
      [{ ...root, children: [{ type: 'section', orientation: 'landscape', children: [flow] }] }, 'children[0].orientation'],
      [{ ...root, children: [{ type: 'contents', contentsDepth: 3 }] }, 'children[0].contentsDepth'],
      [{ ...root, children: [{ type: 'part', name: 'one', contentsLabel: 'One', number: 1, children: [] }] }, 'children[0]'],
      [
        {
          ...root,
          templates: [{ type: 'template', name: 'record', html: '<p>Record</p>', slots: [{ key: 'name', label: 'Name', type: 'text' }] }],
          children: [{ type: 'record', template: 'record', values: { name: 'One' }, children: [] }],
        },
        'children[0].children',
      ],
      [{ ...root, settings: { unknown: true }, children: [] }, 'settings.unknown'],
      [{ ...root, settings: { lineNumbers: { interval: 5, every: 5 } }, children: [] }, 'settings.lineNumbers.every'],
      [{ ...root, settings: { sideNotes: { side: 'outer', width: 20 } }, children: [] }, 'settings.sideNotes.width'],
      [{ ...root, metadata: { title: 'Book', unknown: true }, children: [] }, 'metadata.unknown'],
      [{ ...root, print: { unknown: true }, children: [] }, 'print.unknown'],
      [
        {
          ...root,
          mode: 'paginated',
          page: { paper: { width: 100, height: 150, unit: 'mm', unknown: true }, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
          children: [],
        },
        'page.paper.unknown',
      ],
      [{ ...root, children: [{ type: 'section', children: [{ type: 'flow', html: '', htnl: '' }] }] }, 'children[0].children[0].htnl'],
    ] as const
    for (const [value, path] of cases) {
      const result = Document.safeParse(value)
      expect(result.success).toBeFalse()
      if (!result.success && result.error instanceof z.ZodError)
        expect(result.error.issues.some((issue) => issue.message.includes(`${path}: unknown`))).toBeTrue()
    }
  })

  test('reports parent-page margin remedy and several unknown keys in one issue', () => {
    const root = { type: 'document' as const, kind: 'book' as const, title: 'Book', mode: 'continuous' as const, children: [] }
    const margin = Document.safeParse({ ...root, parentPages: [{ type: 'parentPage', name: 'body', margin: 12 }] })
    expect(margin.success).toBeFalse()
    if (!margin.success && margin.error instanceof z.ZodError)
      expect(margin.error.issues[0]?.message).toContain(
        'parentPages[0].margin: unknown key "margin"; the model does not define it here; move it to geometry.margin',
      )

    const regionMargin = Document.safeParse({
      ...root,
      parentPages: [{ type: 'parentPage', name: 'body', regions: { head: { edge: 'blockStart', html: '', margin: 12 } } }],
    })
    expect(regionMargin.success).toBeFalse()
    if (!regionMargin.success && regionMargin.error instanceof z.ZodError)
      expect(regionMargin.error.issues[0]?.message).toContain(
        'parentPages[0].regions.head.margin: unknown key "margin"; the model does not define it here; remove it',
      )

    const marginAndUnknown = Document.safeParse({
      ...root,
      parentPages: [{ type: 'parentPage', name: 'body', margin: 12, future: true }],
    })
    expect(marginAndUnknown.success).toBeFalse()
    if (!marginAndUnknown.success && marginAndUnknown.error instanceof z.ZodError)
      expect(marginAndUnknown.error.issues[0]?.message).toContain('move "margin" to geometry.margin and remove "future"')

    const multiple = Document.safeParse({ ...root, children: [{ type: 'part', name: 'one', number: 1, contentsLabel: 'One', children: [] }] })
    expect(multiple.success).toBeFalse()
    if (!multiple.success && multiple.error instanceof z.ZodError) {
      const issue = multiple.error.issues.find((candidate) => candidate.code === 'unrecognized_keys')
      expect(issue?.message).toContain('children[0]: unknown keys "number", "contentsLabel"')
      expect(multiple.error.issues.filter((candidate) => candidate.code === 'unrecognized_keys')).toHaveLength(1)
    }
  })

  test('keeps author-named maps open', () => {
    const parsed = Document.parse({
      type: 'document',
      kind: 'book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      metadata: { title: 'Book', extra: { 'catalog-name': 'Voyages' } },
      templates: [{ type: 'template', name: 'record', html: '<p>Record</p>', slots: [{ key: 'custom.value', label: 'Value', type: 'text' }] }],
      children: [{ type: 'part', name: 'records', children: [{ type: 'record', title: 'One', template: 'record', values: { 'custom.value': 'One' } }] }],
    })
    expect(parsed.metadata?.extra).toEqual({ 'catalog-name': 'Voyages' })
    expect(parsed.children[0]).toMatchObject({ children: [{ values: { 'custom.value': 'One' } }] })
    expect(FillValues.parse({ 'custom.asset': { asset: 'media/one' }, 'custom.text': 'Text' })).toEqual({
      'custom.asset': { asset: 'media/one' },
      'custom.text': 'Text',
    })
  })

  test('exports nested closed nodes in the document JSON Schema', () => {
    const schemas = jsonSchemas()
    expect(schemas).toHaveProperty('document')
    const objects = (value: unknown): Record<string, unknown>[] => {
      if (typeof value !== 'object' || value === null) return []
      const record = value as Record<string, unknown>
      return [record, ...Object.values(record).flatMap(objects)]
    }
    const flowNode = objects(schemas.document).find((object) => {
      const properties = object.properties as Record<string, unknown> | undefined
      const type = properties?.type as Record<string, unknown> | undefined
      return type?.const === 'flow'
    })
    expect(flowNode?.additionalProperties).toBeFalse()
    for (const legacy of ['deck', 'page', 'book', 'board']) expect(schemas).not.toHaveProperty(legacy)
  })
})
