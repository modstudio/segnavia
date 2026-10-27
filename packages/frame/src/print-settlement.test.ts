import { expect, test } from 'bun:test'
import { MESSAGE } from './bridge.ts'
import { printDocumentSettled, slotFitStillPending } from './print-settlement.ts'

function deferred() {
  let resolve = () => {}
  let reject = () => {}
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

class FakeImage extends EventTarget {
  constructor(readonly complete: boolean) {
    super()
  }

  settle(type: 'load' | 'error') {
    this.dispatchEvent(new Event(type))
  }
}

class FakeDecodingImage extends EventTarget {
  readonly complete = true
  private decoding = deferred()

  decode() {
    return this.decoding.promise
  }

  settle() {
    this.decoding.resolve()
  }

  fail() {
    this.decoding.reject()
  }
}

function report(messages: EventTarget, frame: EventTarget, data: unknown) {
  const event = new MessageEvent('message', { data })
  Object.defineProperty(event, 'source', { value: frame })
  messages.dispatchEvent(event)
}

function reportReady(messages: EventTarget, frame: EventTarget) {
  report(messages, frame, { type: MESSAGE.ready })
}

function reportSlotFit(messages: EventTarget, frame: EventTarget, slots: Record<string, 'fit' | 'shrunk' | 'overflowed'>) {
  report(messages, frame, { type: MESSAGE.slotFit, slots })
}

async function resolutionOf(wait: Promise<unknown>) {
  let resolved = false
  void wait.then(() => {
    resolved = true
  })
  await Promise.resolve()
  return () => resolved
}

test('an incomplete image holds printing until it loads', async () => {
  const image = new FakeImage(false)
  const wait = printDocumentSettled(new EventTarget(), [], [image], deferred().promise)
  const resolved = await resolutionOf(wait)
  expect(resolved()).toBeFalse()
  image.settle('load')
  await expect(wait).resolves.toBeTrue()
  expect(resolved()).toBeTrue()
})

test('an image error settles the print document', async () => {
  const image = new FakeImage(false)
  const wait = printDocumentSettled(new EventTarget(), [], [image], deferred().promise)
  const resolved = await resolutionOf(wait)
  expect(resolved()).toBeFalse()
  image.settle('error')
  await wait
  expect(resolved()).toBeTrue()
})

test('an image with decode holds printing until decoding finishes', async () => {
  const image = new FakeDecodingImage()
  const wait = printDocumentSettled(new EventTarget(), [], [image], deferred().promise)
  const resolved = await resolutionOf(wait)
  expect(resolved()).toBeFalse()
  image.settle()
  await wait
  expect(resolved()).toBeTrue()
})

test('an image decode failure settles the print document', async () => {
  const image = new FakeDecodingImage()
  const wait = printDocumentSettled(new EventTarget(), [], [image], deferred().promise)
  const resolved = await resolutionOf(wait)
  expect(resolved()).toBeFalse()
  image.fail()
  await wait
  expect(resolved()).toBeTrue()
})

test('frames and images must both settle', async () => {
  const messages = new EventTarget()
  const frame = new EventTarget()
  const image = new FakeImage(false)
  const wait = printDocumentSettled(messages, [frame], [image], deferred().promise)
  const resolved = await resolutionOf(wait)
  reportReady(messages, frame)
  await Promise.resolve()
  expect(resolved()).toBeFalse()
  image.settle('load')
  await wait
  expect(resolved()).toBeTrue()

  const otherMessages = new EventTarget()
  const otherFrame = new EventTarget()
  const otherImage = new FakeImage(false)
  const otherWait = printDocumentSettled(otherMessages, [otherFrame], [otherImage], deferred().promise)
  const otherResolved = await resolutionOf(otherWait)
  otherImage.settle('load')
  await Promise.resolve()
  expect(otherResolved()).toBeFalse()
  reportReady(otherMessages, otherFrame)
  await expect(otherWait).resolves.toBeTrue()
  expect(otherResolved()).toBeTrue()
})

test('the deadline releases a print document with a pending image', async () => {
  const deadline = deferred()
  const image = new FakeImage(false)
  const wait = printDocumentSettled(new EventTarget(), [], [image], deadline.promise)
  const resolved = await resolutionOf(wait)
  expect(resolved()).toBeFalse()
  deadline.resolve()
  await wait
  expect(resolved()).toBeTrue()
})

test('an already complete image does not hold printing', async () => {
  const complete = new FakeImage(true)
  const pending = new FakeImage(false)
  const wait = printDocumentSettled(new EventTarget(), [], [complete, pending], deferred().promise)
  const resolved = await resolutionOf(wait)
  expect(resolved()).toBeFalse()
  pending.settle('load')
  await wait
  expect(resolved()).toBeTrue()
})

test('a marked slot still pending after ready holds printing until its fit report', async () => {
  const messages = new EventTarget()
  const frame = new EventTarget()
  const measured = new Map<string, number>()
  const wait = printDocumentSettled(
    messages,
    [frame],
    [],
    deferred().promise,
    (slots) => {
      for (const key of Object.keys(slots)) measured.set(key, (measured.get(key) ?? 0) + 1)
    },
    () => slotFitStillPending(new Map([['name', 1]]), measured, new Set(['name'])),
  )
  const resolved = await resolutionOf(wait)
  reportReady(messages, frame)
  await Promise.resolve()
  expect(resolved()).toBeFalse()
  expect(measured.size).toBe(0)
  reportSlotFit(messages, frame, { name: 'overflowed' })
  await wait
  expect(resolved()).toBeTrue()
  expect(measured.get('name')).toBe(1)
})

test('the deadline releases a print document still waiting for a fit report', async () => {
  const deadline = deferred()
  const messages = new EventTarget()
  const frame = new EventTarget()
  const wait = printDocumentSettled(messages, [frame], [], deadline.promise, undefined, () => true)
  const resolved = await resolutionOf(wait)
  expect(resolved()).toBeFalse()
  deadline.resolve()
  await expect(wait).resolves.toBeFalse()
  expect(resolved()).toBeTrue()
})

test('slotFitStillPending is true only while a marked key has fewer reports than frames', () => {
  const marked = new Map([
    ['name', 2],
    ['role', 1],
  ])
  const refuseKeys = new Set(['name', 'role'])
  expect(slotFitStillPending(marked, new Map(), refuseKeys)).toBeTrue()
  expect(slotFitStillPending(marked, new Map([['name', 2]]), refuseKeys)).toBeTrue()
  expect(
    slotFitStillPending(
      marked,
      new Map([
        ['name', 2],
        ['role', 1],
      ]),
      refuseKeys,
    ),
  ).toBeFalse()
  expect(slotFitStillPending(new Map(), new Map(), refuseKeys)).toBeFalse()
})

test('a missing shrink report does not hold printing until the deadline', async () => {
  const messages = new EventTarget()
  const frame = new EventTarget()
  const deadline = deferred()
  const wait = printDocumentSettled(messages, [frame], [], deadline.promise, undefined, () => slotFitStillPending(new Map([['name', 1]]), new Map(), new Set()))
  const resolved = await resolutionOf(wait)
  reportReady(messages, frame)
  await wait
  expect(resolved()).toBeTrue()
})
