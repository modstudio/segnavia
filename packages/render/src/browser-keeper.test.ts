import { expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import type { Browser } from 'playwright-core'
import { keepBrowser } from './browser-keeper.ts'
import { rendererClosed, RendererUnavailableError } from './errors.ts'

class FakeBrowser extends EventEmitter {
  closeCalls = 0
  connected = true

  isConnected() {
    return this.connected
  }

  async close() {
    this.closeCalls++
    this.connected = false
    this.emit('disconnected', this)
  }

  drop() {
    this.connected = false
    this.emit('disconnected', this)
  }
}

const asBrowser = (fake: FakeBrowser): Browser => fake as unknown as Browser

test('reuses the live browser', async () => {
  const fake = new FakeBrowser()
  let launches = 0
  const keeper = keepBrowser(async () => {
    launches++
    return asBrowser(fake)
  })
  expect(await keeper.browser()).toBe(asBrowser(fake))
  expect(await keeper.browser()).toBe(asBrowser(fake))
  expect(launches).toBe(1)
})

test('relaunches after disconnect', async () => {
  const first = new FakeBrowser()
  const second = new FakeBrowser()
  let launches = 0
  const keeper = keepBrowser(async () => asBrowser(launches++ === 0 ? first : second))
  expect(await keeper.browser()).toBe(asBrowser(first))
  first.drop()
  expect(await keeper.browser()).toBe(asBrowser(second))
  expect(launches).toBe(2)
})

test('concurrent callers share one launch', async () => {
  let launches = 0
  let finish!: (browser: Browser) => void
  const keeper = keepBrowser(() => {
    launches++
    return new Promise<Browser>((resolve) => {
      finish = resolve
    })
  })
  const first = keeper.browser()
  const second = keeper.browser()
  expect(launches).toBe(1)
  const fake = new FakeBrowser()
  finish(asBrowser(fake))
  expect(await first).toBe(asBrowser(fake))
  expect(await second).toBe(asBrowser(fake))
  expect(launches).toBe(1)
})

test('retries after a failed launch', async () => {
  const fake = new FakeBrowser()
  let attempts = 0
  const keeper = keepBrowser(async () => {
    attempts++
    if (attempts === 1) throw new Error('no chrome')
    return asBrowser(fake)
  })
  await expect(keeper.browser()).rejects.toThrow('no chrome')
  expect(await keeper.browser()).toBe(asBrowser(fake))
  expect(attempts).toBe(2)
})

test('refuses after close', async () => {
  const keeper = keepBrowser(async () => asBrowser(new FakeBrowser()))
  await keeper.browser()
  await keeper.close()
  await expect(keeper.browser()).rejects.toBeInstanceOf(RendererUnavailableError)
  await expect(keeper.browser()).rejects.toThrow(rendererClosed().message)
})

test("close awaits the browser's close", async () => {
  const fake = new FakeBrowser()
  let finished = false
  fake.close = async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 20))
    finished = true
    fake.connected = false
    fake.emit('disconnected', fake)
  }
  const keeper = keepBrowser(async () => asBrowser(fake))
  await keeper.browser()
  const done = keeper.close()
  expect(finished).toBe(false)
  await done
  expect(finished).toBe(true)
})

test('close waits for an in-flight launch and closes that browser', async () => {
  let finish!: (browser: Browser) => void
  const fake = new FakeBrowser()
  const keeper = keepBrowser(
    () =>
      new Promise<Browser>((resolve) => {
        finish = resolve
      }),
  )
  const pending = keeper.browser()
  const closing = keeper.close()
  finish(asBrowser(fake))
  await expect(pending).rejects.toBeInstanceOf(RendererUnavailableError)
  await expect(pending).rejects.toThrow(rendererClosed().message)
  await closing
  expect(fake.closeCalls).toBe(1)
  await expect(keeper.browser()).rejects.toBeInstanceOf(RendererUnavailableError)
  await expect(keeper.browser()).rejects.toThrow(rendererClosed().message)
})

test('does not relaunch for a disconnect after close', async () => {
  const first = new FakeBrowser()
  let launches = 0
  const keeper = keepBrowser(async () => {
    launches++
    return asBrowser(launches === 1 ? first : new FakeBrowser())
  })
  await keeper.browser()
  await keeper.close()
  first.drop()
  await expect(keeper.browser()).rejects.toBeInstanceOf(RendererUnavailableError)
  expect(launches).toBe(1)
})
