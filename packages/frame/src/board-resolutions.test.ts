import { expect, test } from 'bun:test'
import { type BoardItem, Document } from '@segnavia/format'
import { BoardResolutions } from './board-resolutions.ts'

const item = (id: string, address = id, kind: BoardItem['kind'] = 'media'): BoardItem => ({ id, address, kind, x: 0, y: 0, width: 100 })
const image = { kind: 'image' as const, src: 'image.png', width: 640, height: 480 }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('deduplicates requests by address and shares the resolved value', async () => {
  const resolutions = new BoardResolutions()
  let calls = 0
  resolutions.resolver = async () => {
    calls += 1
    return image
  }
  const first = item('first', 'shared')
  const second = item('second', 'shared')
  resolutions.request(
    first,
    () => {},
    () => {},
  )
  resolutions.request(
    second,
    () => {},
    () => {},
  )
  await settle()
  expect(calls).toBe(1)
  expect(resolutions.value(first.address)).toEqual(image)
  expect(resolutions.value(second.address)).toEqual(image)
})

test('reports a refused value once and does not expose it', async () => {
  const resolutions = new BoardResolutions()
  const paper = item('paper', 'paper', 'paper')
  const failures: unknown[] = []
  resolutions.resolver = async () => image
  resolutions.request(
    paper,
    () => {},
    (failedItem, error) => {
      if (resolutions.fail(failedItem)) failures.push(error)
    },
  )
  await settle()
  expect(failures).toHaveLength(1)
  expect(resolutions.value(paper.address)).toBeUndefined()
})

test('marks a failure only once', () => {
  const resolutions = new BoardResolutions()
  const failed = item('failed')
  resolutions.resolver = async () => image
  resolutions.request(
    failed,
    () => {},
    () => {},
  )
  expect(resolutions.fail(failed)).toBe(true)
  expect(resolutions.fail(failed)).toBe(false)
})

test('drops entries outside the kept addresses', async () => {
  const resolutions = new BoardResolutions()
  let calls = 0
  const dropped = item('dropped')
  resolutions.resolver = async () => {
    calls += 1
    return image
  }
  resolutions.request(
    dropped,
    () => {},
    () => {},
  )
  await settle()
  resolutions.keep([])
  resolutions.request(
    dropped,
    () => {},
    () => {},
  )
  await settle()
  expect(calls).toBe(2)
})

test('drops a cached entry when an address changes kind', async () => {
  const resolutions = new BoardResolutions()
  let calls = 0
  resolutions.resolver = async (requested) => {
    calls += 1
    return requested.kind === 'media'
      ? image
      : {
          kind: 'page',
          page: { type: 'document', kind: 'page', size: { width: 8, height: 11 }, children: [{ type: 'page', body: { html: '' } }] },
          size: { width: 8, height: 11 },
        }
  }
  const media = item('asset', 'shared', 'media')
  resolutions.request(
    media,
    () => {},
    () => {},
  )
  await settle()
  const page = item('asset', 'shared', 'page')
  resolutions.keep([page])
  resolutions.request(
    page,
    () => {},
    () => {},
  )
  await settle()
  expect(calls).toBe(2)
  expect(resolutions.value('shared')?.kind).toBe('page')
})

test('settles and reports a refused board brand once when items carry their own brands', async () => {
  const failures: unknown[] = []
  const resolutions = new BoardResolutions((error) => failures.push(error))
  resolutions.configure(Document.parse({ type: 'document', kind: 'board', title: 'Board', settings: { dir: 'ltr' }, brand: 'board', children: [] }), {
    source: { brand: async (name) => (name === 'item' ? { css: '.item{color:red}' } : undefined) },
  })
  const deck = item('deck', 'deck', 'deck')
  resolutions.resolver = async () => ({
    kind: 'deck',
    deck: {
      type: 'document',
      kind: 'deck',
      title: 'Deck',
      brand: 'item',
      children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '<p>One</p>' } }],
    },
  })
  const resolved: unknown[] = []
  resolutions.request(
    deck,
    (_item, value) => resolved.push(value),
    () => {},
  )
  await settle()

  expect(failures).toHaveLength(1)
  expect(String(failures[0])).toContain('unknown to the BrandSource')
  expect(resolved).toHaveLength(1)
})

test('routes an item brand refusal through request failure', async () => {
  const resolutions = new BoardResolutions()
  resolutions.configure(null, { source: { brand: async () => undefined } })
  const deck = item('deck-refused', 'deck-refused', 'deck')
  resolutions.resolver = async () => ({
    kind: 'deck',
    deck: {
      type: 'document',
      kind: 'deck',
      title: 'Deck',
      brand: 'missing',
      children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '<p>One</p>' } }],
    },
  })
  const failures: unknown[] = []
  resolutions.request(
    deck,
    () => {},
    (_item, error) => failures.push(error),
  )
  await settle()

  expect(failures).toHaveLength(1)
  expect(String(failures[0])).toContain('unknown to the BrandSource')
})
