import { expect, test } from 'bun:test'
import { handlePlayerKey } from './player-key.ts'

test('the player leaves letter shortcuts typed in editable targets alone', () => {
  let keys = 0
  let prevented = false
  const controller = {
    key: () => {
      keys++
      return 'present'
    },
  }
  const event = {
    key: 'f',
    composedPath: () => [{ tagName: 'TEXTAREA', isContentEditable: false }],
    preventDefault: () => {
      prevented = true
    },
  } as unknown as KeyboardEvent
  handlePlayerKey(controller as never, {}, event)
  expect(keys).toBe(0)
  expect(prevented).toBe(false)
})
