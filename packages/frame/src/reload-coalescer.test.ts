import { expect, test } from 'bun:test'
import { ReloadCoalescer } from './reload-coalescer.ts'

test('reload scheduling coalesces changes over a fake clock', () => {
  let callback: (() => void) | undefined
  let clears = 0
  let reloads = 0
  const coalescer = new ReloadCoalescer(
    {
      set: (next) => {
        callback = next
        return 1
      },
      clear: () => clears++,
    },
    () => reloads++,
  )
  coalescer.schedule(150)
  coalescer.schedule(150)
  coalescer.schedule(150)
  callback?.()
  expect({ clears, reloads }).toEqual({ clears: 2, reloads: 1 })
})
