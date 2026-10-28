import { expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { RendererUnavailableError } from './errors.ts'

let instance: FakeBrowser
let launches = 0

class FakeBrowser extends EventEmitter {
  connected = true

  isConnected() {
    return this.connected
  }

  drop() {
    this.connected = false
    this.emit('disconnected')
  }

  async close() {
    this.drop()
  }

  async newContext() {
    return {
      route: async () => {},
      routeWebSocket: async () => {},
      newPage: async () => tab,
      close: async () => {},
    }
  }
}

const tab = {
  setContent: async () => {},
  evaluate(callback: (...args: never[]) => unknown) {
    if (String(callback).includes('document.fonts')) return Promise.resolve(true)
    return Promise.resolve({ extent: 100, endOverflow: 0, extentClipped: false, rtl: false, elements: [] })
  },
  emulateMedia: async () => {},
  pdf: async () => new Uint8Array([1, 2, 3]),
  on: () => tab,
}

mock.module('playwright-core', () => ({
  chromium: {
    launch: async () => {
      launches++
      instance = new FakeBrowser()
      return instance
    },
  },
}))

test('a browser disconnect settles pending work promptly and the next render relaunches', async () => {
  launches = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const first = instance
  const started = performance.now()
  const rendered = renderer.pagePdf(
    { html: '<p>x</p>', size: { width: 200, height: 100 } },
    {
      boundMs: 2000,
      effects: false,
      beforeOutput: async () => {
        first.drop()
        await new Promise(() => {})
      },
    },
  )
  const error = await rendered.then(
    () => undefined,
    (reason) => reason,
  )
  const elapsedMs = performance.now() - started
  expect(error).toBeInstanceOf(RendererUnavailableError)
  expect(elapsedMs).toBeLessThan(500)
  expect(first.listenerCount('disconnected')).toBe(1)

  expect(await renderer.pagePdf({ html: '<p>again</p>', size: { width: 200, height: 100 } }, { effects: false })).toEqual(new Uint8Array([1, 2, 3]))
  expect(launches).toBe(2)
  await renderer.close()
})
