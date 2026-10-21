import { expect, test } from 'bun:test'
import { waitForAfterPrint, waitForPaint, waitForReadiness } from './print-lifecycle.ts'

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('the shared deadline bounds readiness whose fonts never settle', async () => {
  const deadline = deferred()
  let finished = false
  const waiting = waitForReadiness([new Promise(() => {})], deadline.promise).then(() => {
    finished = true
  })
  await Promise.resolve()
  expect(finished).toBeFalse()
  deadline.resolve()
  await waiting
  expect(finished).toBeTrue()
})

test('the paint barrier crosses two animation frames', async () => {
  const frames: FrameRequestCallback[] = []
  const waiting = waitForPaint((callback) => frames.push(callback))
  expect(frames).toHaveLength(1)
  frames.shift()?.(1)
  expect(frames).toHaveLength(1)
  let painted = false
  void waiting.then(() => {
    painted = true
  })
  await Promise.resolve()
  expect(painted).toBeFalse()
  frames.shift()?.(2)
  await waiting
  expect(painted).toBeTrue()
})

test('the paint barrier ends at its timeout when animation frames are suspended', async () => {
  const started = performance.now()
  await waitForPaint(() => 0, 5)
  expect(performance.now() - started).toBeGreaterThanOrEqual(4)
})

test('afterprint ends the native print lifetime before the fallback', async () => {
  const win = new EventTarget() as Window
  Object.assign(win, { setTimeout, clearTimeout })
  const waiting = waitForAfterPrint(win, 100)
  let ended = false
  void waiting.then(() => {
    ended = true
  })
  win.dispatchEvent(new Event('afterprint'))
  await Promise.resolve()
  expect(ended).toBeTrue()
  await waiting
})

test('the native print lifetime has a fallback when afterprint is absent', async () => {
  const win = new EventTarget() as Window
  Object.assign(win, { setTimeout, clearTimeout })
  const started = performance.now()
  await waitForAfterPrint(win, 5)
  expect(performance.now() - started).toBeGreaterThanOrEqual(4)
})
