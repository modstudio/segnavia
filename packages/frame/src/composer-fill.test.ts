import { expect, test } from 'bun:test'
import { applyRegionOverflow } from './composer-fill.ts'

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

  const outcome = applyRegionOverflow(region, '4', false, () => ({ block: children.length > 1 ? 10 : 0 }))
  expect(children.map((child) => child.id)).toEqual(['first'])
  expect(outcome).toEqual({ mode: 'truncate', droppedIds: ['second', 'third'] })
})
