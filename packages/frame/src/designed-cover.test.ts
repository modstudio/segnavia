import { describe, expect, test } from 'bun:test'
import { Cover, type OriginApproval } from '@segnavia/format'
import { fitDesignedCover } from './fit.ts'
import { pageDocument } from './page-document.test-helper.ts'

class TestElement extends EventTarget {
  className = ''
  clientHeight = 0
  clientWidth = 0
  part = { add() {} }
  style: Record<string, string> = {}
  append() {}
}

describe('designed cover layout', () => {
  test.each([
    [
      { width: 100, height: 100 },
      { width: 100, height: 200 },
      { scale: 0.5, width: 50, height: 100 },
    ],
    [
      { width: 100, height: 100 },
      { width: 200, height: 100 },
      { scale: 0.5, width: 100, height: 50 },
    ],
    [
      { width: 400, height: 300 },
      { width: 100, height: 100 },
      { scale: 3, width: 300, height: 300 },
    ],
  ])('scales a $sheet.width by $sheet.height sheet uniformly inside its tile', (tile, sheet, expected) => {
    expect(fitDesignedCover(tile, sheet)).toEqual(expected)
  })

  test('passes board origins and page widths to a live designed cover page', async () => {
    const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const previousCustomElements = Object.getOwnPropertyDescriptor(globalThis, 'customElements')
    const previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
    const definitions = new Map<string, new () => TestElement>()
    const created: TestElement[] = []
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      value: {
        define: (name: string, ElementConstructor: new () => TestElement) => definitions.set(name, ElementConstructor),
        get: (name: string) => definitions.get(name),
      },
    })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        createElement: (name: string) => {
          const Constructor = definitions.get(name)
          const element = Constructor ? new Constructor() : new TestElement()
          created.push(element)
          return element
        },
      },
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        disconnect() {}
        observe() {}
      },
    })
    try {
      const { mountDesignedCover } = await import('./designed-cover.ts')
      const { internalPageLoad } = await import('./document-value-load.ts')
      const { SegnaviaPage } = await import('./page.ts')
      const style = Object.getOwnPropertyDescriptor(SegnaviaPage.prototype, 'style')
      const pageLoad = Reflect.get(SegnaviaPage.prototype, internalPageLoad)
      Object.defineProperty(SegnaviaPage.prototype, 'style', { configurable: true, value: {} })
      Reflect.set(SegnaviaPage.prototype, internalPageLoad, () => {})
      const origins: readonly OriginApproval[] = [{ origin: 'https://images.example', kinds: ['image'] }]
      const pageWidths = { standard: 900 }
      try {
        const mounted = mountDesignedCover({ kind: 'live', cover: Cover.parse({ page: pageDocument('<p>Cover</p>') }) }, () => {}, { origins, pageWidths })
        const page = created.find((element) => element instanceof SegnaviaPage) as InstanceType<typeof SegnaviaPage> | undefined
        expect(page?.origins).toEqual(origins)
        expect(page?.pageWidths).toEqual(pageWidths)
        mounted.dispose()
      } finally {
        Reflect.set(SegnaviaPage.prototype, internalPageLoad, pageLoad)
        if (style) Object.defineProperty(SegnaviaPage.prototype, 'style', style)
        else Reflect.deleteProperty(SegnaviaPage.prototype, 'style')
      }
    } finally {
      for (const [name, descriptor] of [
        ['HTMLElement', previousHTMLElement],
        ['document', previousDocument],
        ['customElements', previousCustomElements],
        ['ResizeObserver', previousResizeObserver],
      ] as const) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
      }
    }
  })
})
