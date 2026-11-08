import { expect, test } from 'bun:test'
import { coverPresentation, parseDesignedCover } from './designed-cover-policy.ts'
import { mountThumbnailDesignedCover, thumbnailCoverSources } from './thumbnail-designed-cover.ts'

const coverDocument = (html: string, scripts?: 'sandboxed') => ({
  type: 'document' as const,
  kind: 'page' as const,
  settings: { scripts },
  children: [{ type: 'page' as const, body: { html } }],
})

function viewport() {
  const children: HTMLElement[] = []
  return {
    children,
    get firstElementChild() {
      return children[0] ?? null
    },
    append(element: HTMLElement) {
      children.push(element)
    },
  }
}

test('the thumbnail cover edge refuses invalid input and keeps the original valid input separate from its parsed value', () => {
  expect(() => parseDesignedCover({ cover: { page: coverDocument('', 'sandboxed') } }, 'The thumbnail')).toThrow(
    'The thumbnail has an invalid designedCover.cover',
  )
  const input = { cover: { page: coverDocument('cover') } }
  const parsed = parseDesignedCover(input, 'The thumbnail')
  expect(parsed).not.toBe(input)
  expect(parsed.cover.page.print).toBeDefined()
  expect('print' in input.cover.page).toBe(false)
})

test.each([
  [{ kind: 'live', cover: parseDesignedCover({ cover: { page: coverDocument('cover') } }, 'The thumbnail').cover } as const, 'live'],
  [{ kind: 'picture', src: 'kept.webp' } as const, 'picture'],
])('mounts one $kind thumbnail designed cover and guards re-entry', (presentation, kind) => {
  const target = viewport()
  const mounted = { element: { kind } as unknown as HTMLElement, dispose() {} }
  let calls = 0
  const mount = () => {
    calls++
    return mounted
  }
  expect(mountThumbnailDesignedCover(target, presentation, mount)).toBe(mounted)
  expect(mountThumbnailDesignedCover(target, presentation, mount)).toBeUndefined()
  expect(target.children).toEqual([mounted.element])
  expect(calls).toBe(1)
})

test('clearing the thumbnail designed cover restores the fallback presentation', () => {
  expect(coverPresentation(undefined)).toEqual({ kind: 'fallback' })
})

test('a thumbnail live cover receives its slot options with its other sources', () => {
  const slots = { fill: { id: 'cover', values: {} } }
  expect(thumbnailCoverSources(undefined, undefined, undefined, slots).slots).toBe(slots)
})
