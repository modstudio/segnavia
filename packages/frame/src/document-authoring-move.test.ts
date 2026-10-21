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
      () => shown,
      async (input) => void saved.push(input),
    )
    expect(shown.map((page) => page.id)).toEqual(['b', 'c', 'a'])
    expect(saved).toEqual([{ pageId: 'a', fromIndex: 0, toIndex: 2 }])
  })

  test('reverts the optimistic order when persistence fails', async () => {
    const shown: string[][] = []
    let current = pages
    await expect(
      movePageOptimistically(
        pages,
        2,
        0,
        (value) => {
          current = value
          shown.push(value.map((page) => page.id ?? ''))
        },
        () => current,
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

  test('accepts one empty identity and reports duplicate empty identities', () => {
    expect(pageIdentityError([Page.parse({ id: '', html: 'one' })])).toBeNull()
    expect(pageIdentityError([Page.parse({ id: '', html: 'one' }), Page.parse({ id: '', html: 'two' })])).toContain('is repeated')
  })

  test('a failed save does not replace pages supplied while it is pending', async () => {
    let rejectSave = (_error: Error) => {}
    let current = pages
    const moving = movePageOptimistically(
      pages,
      0,
      1,
      (value) => (current = value),
      () => current,
      () => new Promise<void>((_resolve, reject) => (rejectSave = reject)),
    )
    const serverPages = ['server-a', 'server-b'].map((id) => Page.parse({ id, html: id }))
    current = serverPages
    rejectSave(new Error('No'))

    await expect(moving).rejects.toThrow('No')
    expect(current).toBe(serverPages)
  })

  test('refuses indexes outside the document', () => {
    expect(() => reorderPages(pages, 3, 0)).toThrow('outside the document')
  })
})
