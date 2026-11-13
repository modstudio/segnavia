import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { Document } from './document.ts'
import { DocumentDefinitionNode } from './document-nodes-book.ts'

function issues(result: ReturnType<typeof Document.safeParse>): z.core.$ZodIssue[] {
  expect(result.success).toBeFalse()
  if (result.success || !(result.error instanceof z.ZodError)) throw new Error('expected Document parsing to return a ZodError')
  return result.error.issues
}

const book = (children: unknown[]) => ({ type: 'document', kind: 'book', title: 'Book', mode: 'continuous', children })

describe('document node discrimination', () => {
  test('reports a nested known node field at its full path', () => {
    const found = issues(
      Document.safeParse(
        book([
          {
            type: 'section',
            children: [
              { type: 'flow', html: '<p>One</p>' },
              { type: 'flow', html: '<p>Two</p>' },
              { type: 'division', name: 'middle', children: [] },
            ],
          },
        ]),
      ),
    )

    expect(found).toContainEqual(expect.objectContaining({ path: ['children', 0, 'children', 2, 'name'] }))
  })

  test('reports an unknown type and every known document node type in stable order', () => {
    const found = issues(Document.safeParse(book([{ type: 'mystery' }])))
    expect(found).toContainEqual(
      expect.objectContaining({
        path: ['children', 0, 'type'],
        message:
          'node type got "mystery"; use one of "division", "part", "section", "flow", "page", "slide", "placed", "contents", "record", "item", "label", "boardSection" to clear this refusal',
      }),
    )
  })

  test('reports a missing type through the same refusal', () => {
    const found = issues(Document.safeParse(book([{}])))
    expect(found).toContainEqual(
      expect.objectContaining({
        path: ['children', 0, 'type'],
        message:
          'node type got undefined; use one of "division", "part", "section", "flow", "page", "slide", "placed", "contents", "record", "item", "label", "boardSection" to clear this refusal',
      }),
    )
  })

  test('names the value when a node is not an object', () => {
    const found = issues(Document.safeParse(book(['text'])))
    expect(found).toContainEqual(
      expect.objectContaining({
        path: ['children', 0],
        message: expect.stringMatching(/^node got "text"; a node is an object whose type is one of "division", /),
      }),
    )
  })

  test('reports a variable kind through its inner discriminator', () => {
    const result = DocumentDefinitionNode.safeParse({ type: 'variable', name: 'running-head', kind: 'unknown' })
    expect(result.success).toBeFalse()
    if (result.success) throw new Error('expected variable parsing to fail')
    expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['kind'] }))
  })
})
