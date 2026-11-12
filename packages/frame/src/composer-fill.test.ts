import { expect, test } from 'bun:test'
import { applyRegionOverflow, repeatFill } from './composer-fill.ts'

function fillRegion(options: { min?: string; max?: string; blockSize: (count: number) => number }) {
  const children: Array<{ remove(): void; setAttribute(name: string, value: string): void; getAttribute(name: string): string | null; cloneNode(): unknown }> =
    []
  const child = () => {
    const held = {
      remove: () => children.splice(children.indexOf(held), 1),
      setAttribute: () => {},
      getAttribute: (name: string) => (name === 'data-fill-min' ? (options.min ?? null) : name === 'data-fill-max' ? (options.max ?? null) : null),
      cloneNode: () => child(),
    }
    return held
  }
  const source = child()
  children.push(source)
  return {
    children,
    region: {
      querySelector: () => source,
      getAttribute: (name: string) => (name === 'data-region' ? 'practice' : null),
      getBoundingClientRect: () => ({ height: options.blockSize(children.length) }),
      append: (copy: (typeof children)[number]) => children.push(copy),
      setAttribute: () => {},
      closest: () => null,
    } as unknown as HTMLElement,
  }
}

test('truncate applies without a preflight profile', () => {
  const children = ['first', 'second', 'third'].map((id) => ({
    id,
    getAttribute: (name: string) => (name === 'data-segnavia-id' ? id : null),
    remove() {
      children.splice(children.indexOf(this), 1)
    },
  }))
  const region = {
    get lastElementChild() {
      return children.at(-1) ?? null
    },
    getAttribute: (name: string) => (name === 'data-overflow' ? 'truncate' : name === 'data-region' ? 'practice' : null),
    closest: () => null,
  } as unknown as HTMLElement

  const outcome = applyRegionOverflow(
    region,
    '4',
    false,
    () => ({ block: children.length > 1 ? 10 : 0 }),
    () => false,
  )
  expect(children.map((child) => child.id)).toEqual(['first'])
  expect(outcome).toEqual({ mode: 'truncate', droppedIds: ['second', 'third'] })
})

test('truncate gives distinct fallback ids to id-less dropped blocks', () => {
  const children = Array.from({ length: 3 }, () => ({
    id: '',
    getAttribute: () => null,
    remove() {
      children.splice(children.indexOf(this), 1)
    },
  }))
  const region = {
    get lastElementChild() {
      return children.at(-1) ?? null
    },
    getAttribute: (name: string) => (name === 'data-overflow' ? 'truncate' : name === 'data-region' ? 'practice' : null),
    closest: () => null,
  } as unknown as HTMLElement

  const outcome = applyRegionOverflow(
    region,
    '4',
    false,
    () => ({ block: children.length > 1 ? 10 : 0 }),
    () => false,
  )
  expect(outcome.droppedIds).toEqual(['region:practice:2', 'region:practice:1'])
})

test('repeat fill refuses a region without a definite block size', () => {
  const fixture = fillRegion({ blockSize: () => 0 })
  expect(() =>
    repeatFill(
      fixture.region,
      0,
      () => ({ block: 0 }),
      () => fixture.children.length * 10,
    ),
  ).toThrow('no definite block size')
})

test('repeat fill refuses when its minimum cannot fit', () => {
  const fixture = fillRegion({ min: '3', max: '3', blockSize: () => 20 })
  expect(() =>
    repeatFill(
      fixture.region,
      20,
      () => ({ block: fixture.children.length > 1 ? 10 : 0 }),
      () => fixture.children.length * 10,
    ),
  ).toThrow('cannot fit its data-fill minimum of 3')
})

test('repeat fill refuses a content-driven block size', () => {
  const fixture = fillRegion({ blockSize: (count) => count * 10 })
  expect(() =>
    repeatFill(
      fixture.region,
      10,
      () => ({ block: 0 }),
      () => fixture.children.length * 10,
    ),
  ).toThrow('indefinite block size')
})

test('repeat fill refuses a child that adds no block extent', () => {
  const fixture = fillRegion({ blockSize: () => 100 })
  expect(() =>
    repeatFill(
      fixture.region,
      100,
      () => ({ block: 0 }),
      () => 10,
    ),
  ).toThrow('cannot make block progress')
  expect(fixture.children).toHaveLength(1)
})
