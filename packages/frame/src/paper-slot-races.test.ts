import { expect, test } from 'bun:test'
import type { SlotsOptions } from '@segnavia/format'

class TestElement extends EventTarget {}
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  window: { addEventListener() {}, removeEventListener() {} },
})

const { SegnaviaPaper } = await import('./paper.ts')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const assetSlot = [{ key: 'logo', label: 'Logo', type: 'image' as const, required: false }]

test('paper invalidates a pending fill when slot options are removed', async () => {
  const asset = deferred<string>()
  const pages: Array<{ html: string; scripts: 'refuse'; slots?: typeof assetSlot }> = [{ html: '<img data-slot-src="logo">', scripts: 'refuse' }]
  let paints = 0
  const paper = {
    isConnected: true,
    slotPreparation: undefined,
    cancelSlotPreparation: (SegnaviaPaper.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    pages,
    imposition: {},
    imposed: {},
    slotGeneration: 0,
    resolvedSlots: undefined,
    slotOptions: {
      declarations: assetSlot,
      fill: { id: 'x', values: { logo: { asset: 'logo' } } },
      resolveAsset: () => asset.promise,
    } as SlotsOptions | undefined,
    paintResolved() {
      paints++
    },
    paintPlaceholder() {},
    dispatchEvent() {
      return true
    },
    paint: (SegnaviaPaper.prototype as unknown as { paint(): void }).paint,
  }
  paper.paint()
  Object.getOwnPropertyDescriptor(SegnaviaPaper.prototype, 'slots')?.set?.call(paper, undefined)
  asset.resolve('data:image/png;base64,AAAA')
  await asset.promise
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paints).toBe(1)
})

test('disconnecting paper aborts a pending fill without reporting or repainting', async () => {
  const asset = deferred<string>()
  const reports: unknown[] = []
  let paints = 0
  const paper = {
    isConnected: true,
    pages: [{ html: '<img data-slot-src="logo">', scripts: 'refuse', slots: assetSlot }],
    imposition: {},
    imposed: {},
    slotGeneration: 0,
    slotPreparation: undefined,
    resolvedSlots: undefined,
    slotOptions: {
      fill: { id: 'x', values: { logo: { asset: 'logo' } } },
      resolveAsset: () => asset.promise,
      report: (report: unknown) => reports.push(report),
    } as SlotsOptions,
    resize: { disconnect() {} },
    cancelSlotPreparation: (SegnaviaPaper.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintResolved() {
      paints++
    },
    paintPlaceholder() {},
    dispatchEvent() {
      return true
    },
    paint: (SegnaviaPaper.prototype as unknown as { paint(): void }).paint,
  }
  paper.paint()
  paper.isConnected = false
  ;(SegnaviaPaper.prototype as unknown as { disconnectedCallback(): void }).disconnectedCallback.call(paper)
  asset.resolve('data:image/png;base64,AAAA')
  await asset.promise
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paints).toBe(0)
  expect(reports).toEqual([])
})
