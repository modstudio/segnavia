import { expect, test } from 'bun:test'
import { MESSAGE } from './bridge.ts'
import { printDocumentSettled } from './print-settlement.ts'

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

function reportReady(messages: EventTarget, frame: EventTarget) {
  const event = new MessageEvent('message', { data: { type: MESSAGE.ready } })
  Object.defineProperty(event, 'source', { value: frame })
  messages.dispatchEvent(event)
}

async function resolutionOf(wait: Promise<void>) {
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
  await wait
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
  await otherWait
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
