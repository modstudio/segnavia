import { expect, test } from 'bun:test'
import type { Clock } from './clock.ts'
import { DeckController } from './controller.ts'
import { suspendController } from './controller-connection.ts'

test('removing a controller host pauses its clock and leaves it reusable', async () => {
  let clockPaused = 0
  const clock: Clock = {
    word: () => null,
    ended: () => false,
    elapsed: () => 25,
    progress: () => 0.25,
    pause: () => {
      clockPaused++
    },
    resume: () => {},
    seek: () => {},
    muted: false,
    stop: () => {},
  }
  const controller = new DeckController({ hash: null, clock: () => clock, schedule: () => () => {} })
  await controller.load({
    title: 'Disconnect',
    slides: [{ id: 'one', content: { kind: 'html', html: '' }, holdMs: 100 }],
  })
  await controller.play()

  suspendController(controller)

  expect(controller.state.playing).toBe(false)
  expect(clockPaused).toBe(1)
  await controller.play()
  expect(controller.state.playing).toBe(true)
})
