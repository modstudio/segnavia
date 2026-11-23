import { expect, test } from 'bun:test'
import { emitControllerState } from './controller-events.ts'
import { initialDeckState } from './controller-types.ts'

test('the first empty cue state is dispatched', () => {
  const target = new EventTarget()
  const details: unknown[] = []
  target.addEventListener('cue', (event) => details.push((event as CustomEvent).detail))
  emitControllerState(target, { ...initialDeckState(), shown: [] }, undefined)
  expect(details).toEqual([{ annotations: [] }])
})
