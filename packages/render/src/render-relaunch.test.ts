import { expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { RendererUnavailableError, relaunchUnavailable } from './errors.ts'

const contexts: Array<{ closed: boolean }> = []
let launch: () => Promise<FakeBrowser> = async () => new FakeBrowser()

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
    this.connected = false
    this.emit('disconnected')
  }

  async newContext() {
    // Yield a macrotask so an already-expired bound can settle before this context exists.
    await new Promise<void>((resolve) => setTimeout(resolve, 15))
    const record = { closed: false }
    contexts.push(record)
    return {
      route: async () => {},
      routeWebSocket: async () => {},
      newPage: async () => tab,
      close: async () => {
        record.closed = true
      },
    }
  }
}

const tab = {
  setContent() {
    return Promise.resolve()
  },
  evaluate(callback: (...args: never[]) => unknown) {
    if (String(callback).includes('document.fonts')) return Promise.resolve(true)
    return Promise.resolve({ extent: 200, endOverflow: 0, extentClipped: false, rtl: false, elements: [] })
  },
  emulateMedia() {
    return Promise.resolve()
  },
  pdf() {
    return Promise.resolve(new Uint8Array([1, 2, 3]))
  },
  screenshot() {
    return Promise.resolve(new Uint8Array([4, 5, 6]))
  },
  on() {
    return tab
  },
}

mock.module('playwright-core', () => ({ chromium: { launch: () => launch() } }))

test('a dropped browser whose relaunch outlives the bound times out and does not leave a context open', async () => {
  contexts.length = 0
  const first = new FakeBrowser()
  let resumeRelaunch!: (browser: FakeBrowser) => void
  let launches = 0
  launch = () => {
    launches++
    if (launches === 1) return Promise.resolve(first)
    return new Promise((resolve) => {
      resumeRelaunch = resolve
    })
  }
  const { openRenderer, RenderTimeoutError } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  first.drop()
  const rendered = renderer.pagePdf({ html: '<p>x</p>', size: { width: 200, height: 100 } }, { boundMs: 40, effects: false })
  await expect(rendered).rejects.toBeInstanceOf(RenderTimeoutError)
  resumeRelaunch(new FakeBrowser())
  await new Promise<void>((resolve) => setTimeout(resolve, 50))
  expect(contexts.filter((context) => !context.closed)).toEqual([])
  await renderer.close()
})

test('a failed mid-render relaunch names the exit', async () => {
  const first = new FakeBrowser()
  let launches = 0
  launch = () => {
    launches++
    if (launches === 1) return Promise.resolve(first)
    return Promise.reject(new Error('spawn failed'))
  }
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  first.drop()
  const rendered = renderer.pagePdf({ html: '<p>x</p>', size: { width: 200, height: 100 } }, { boundMs: 1000, effects: false })
  await expect(rendered).rejects.toBeInstanceOf(RendererUnavailableError)
  await expect(rendered).rejects.toThrow(relaunchUnavailable('/fake/chromium', new Error('spawn failed')).message)
  await renderer.close()
})
