import { expect, test } from 'bun:test'
import { OverlayControlsVisibility } from './overlay-controls.ts'

function scheduler() {
  const pending = new Map<number, { run: () => void; delay: number }>()
  let id = 0
  return {
    set: (run: () => void, delay: number) => {
      pending.set(++id, { run, delay })
      return id
    },
    clear: (timer: number) => pending.delete(timer),
    run: () => {
      for (const task of [...pending.values()]) task.run()
      pending.clear()
    },
    delays: () => [...pending.values()].map((task) => task.delay),
  }
}

test('overlay controls hide after playback is idle and reveal for interaction and focus', () => {
  const time = scheduler()
  const states: boolean[] = []
  const visibility = new OverlayControlsVisibility((hidden) => states.push(hidden), time)

  visibility.setPlaying(true)
  expect(time.delays()).toEqual([3000])
  time.run()
  expect(states.at(-1)).toBe(true)

  for (const reveal of [() => visibility.interact(), () => visibility.key(), () => visibility.focus(true)]) {
    reveal()
    expect(states.at(-1)).toBe(false)
  }
  visibility.setPlaying(false)
  time.run()
  expect(states.at(-1)).toBe(false)
})
