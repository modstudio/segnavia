import { describe, expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { movePageOptimistically, pageIdentityError, reorderPages } from './document-authoring-move.ts'

const pages = ['a', 'b', 'c'].map((id) => Page.parse({ id, html: id }))

describe('document authoring reorder', () => {
  test('reorders pages and names the moved page', async () => {
    let shown = [...pages]
    const saved: unknown[] = []
    await movePageOptimistically(
      pages,
      0,
      2,
      (value) => (shown = value),
      async (input) => void saved.push(input),
    )
    expect(shown.map((page) => page.id)).toEqual(['b', 'c', 'a'])
    expect(saved).toEqual([{ pageId: 'a', fromIndex: 0, toIndex: 2 }])
  })

  test('reverts the optimistic order when persistence fails', async () => {
    const shown: string[][] = []
    await expect(
      movePageOptimistically(
        pages,
        2,
        0,
        (value) => shown.push(value.map((page) => page.id ?? '')),
        async () => Promise.reject(new Error('No')),
      ),
    ).rejects.toThrow('No')
    expect(shown).toEqual([
      ['c', 'a', 'b'],
      ['a', 'b', 'c'],
    ])
  })

  test('reports missing and duplicate identities', () => {
    expect(pageIdentityError([Page.parse({ html: 'none' })])).toContain('has no id')
    expect(pageIdentityError([Page.parse({ id: 'same', html: 'one' }), Page.parse({ id: 'same', html: 'two' })])).toContain('is repeated')
  })

  test('refuses indexes outside the document', () => {
    expect(() => reorderPages(pages, 3, 0)).toThrow('outside the document')
  })
})
