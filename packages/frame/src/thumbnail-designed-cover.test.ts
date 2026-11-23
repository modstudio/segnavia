import { expect, test } from 'bun:test'
import { soundCover } from '@segnavia/format'
import { coverPresentation, parseDesignedCover } from './designed-cover-policy.ts'
import { pageDocument } from './page-document.test-helper.ts'
import { mountThumbnailDesignedCover, thumbnailCoverFrameInputs, thumbnailCoverSources } from './thumbnail-designed-cover.ts'

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
  expect(() => parseDesignedCover({ cover: { page: pageDocument('', 'sandboxed') } }, 'The thumbnail')).toThrow(
    'The thumbnail has an invalid designedCover.cover',
  )
  const input = { cover: { page: pageDocument('cover') } }
  const parsed = parseDesignedCover(input, 'The thumbnail')
  expect(parsed).not.toBe(input)
  expect(parsed.cover.page.print).toBeDefined()
  expect('print' in input.cover.page).toBe(false)
})

test.each([
  [{ kind: 'live', cover: parseDesignedCover({ cover: { page: pageDocument('cover') } }, 'The thumbnail').cover } as const, 'live'],
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

test('a designed cover still wins over a sound standard face', () => {
  const fallback = soundCover({ format: 'mp3', durationMs: 1_000 })
  const designed = parseDesignedCover({ cover: { page: pageDocument('Designed') } }, 'The sound')
  expect(fallback.page.body).not.toEqual(designed.cover.page.body)
  expect(coverPresentation(designed)).toEqual({ kind: 'live', cover: designed.cover })
})

test('a thumbnail live cover receives its slot options with its other sources', () => {
  const slots = { fill: { id: 'cover', values: {} } }
  expect(thumbnailCoverSources(undefined, undefined, undefined, slots).slots).toBe(slots)
})

test('a thumbnail live cover receives the serving seam with its frame inputs', () => {
  const serveFrame = () => '/frames/cover'
  expect(thumbnailCoverFrameInputs(thumbnailCoverSources(undefined, undefined, undefined, undefined), undefined, [], undefined, serveFrame).serveFrame).toBe(serveFrame)
})

test('a thumbnail live cover passes form refusal with its frame inputs', () => {
  expect(thumbnailCoverFrameInputs(thumbnailCoverSources(undefined, undefined, undefined, undefined), undefined, [], 'refuse', undefined).forms).toBe('refuse')
})
