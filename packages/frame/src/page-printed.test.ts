import { describe, expect, test } from 'bun:test'
import { Page, type SlotsOptions } from '@segnavia/format'
import { frameSandbox, MESSAGE } from './bridge.ts'
import { toggleTestAttribute } from './page-element.test-helper.ts'
import { mountPageFrame } from './page-element-layout.ts'

class TestElement extends EventTarget {
  toggleAttribute(name: string, force?: boolean) {
    return toggleTestAttribute(this as never, name, force)
  }
}

Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
})

const { SegnaviaPage } = await import('./page.ts')

const printedDocument = (body = '<p>One paper</p>', withSlots = false) => ({
  type: 'document' as const,
  kind: 'printed' as const,
  settings: { scripts: 'refuse' as const, lang: 'en' },
  print: { paper: 'letter' as const },
  ...(withSlots ? { data: { slots: [{ key: 'name', label: 'Name', type: 'text' as const }] } } : {}),
  parentRules: [{ parent: 'body' }],
  parentPages: [
    {
      type: 'parentPage' as const,
      name: 'body',
      geometry: { margin: { blockStart: 20, blockEnd: 20, inlineStart: 20, inlineEnd: 20 } },
    },
  ],
  children: [{ type: 'page' as const, id: 'one', body: { html: body } }],
})

function pageFrame() {
  const attributes = new Map<string, string>()
  return {
    srcdoc: '',
    title: '',
    contentWindow: {},
    addEventListener() {},
    setAttribute(name: string, value: string) {
      attributes.set(name, value)
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null
    },
  }
}

function loadingHarness(slotOptions?: SlotsOptions) {
  let iframe = pageFrame()
  let sheet: { frame?: ReturnType<typeof pageFrame> } | undefined
  const errors: Error[] = []
  const attributes = new Map<string, string>()
  const page = {
    isConnected: true,
    loadGeneration: 0,
    slotPreparation: undefined,
    slotOptions,
    pageRequests: { pending: new Set(), posted: new Set(), ready: new Set() },
    cancelSelectionRequests() {},
    cancelSlotPreparation: (SegnaviaPage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    releaseFrame: (SegnaviaPage.prototype as unknown as { releaseFrame(): number }).releaseFrame,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    toggleAttribute(name: string, force?: boolean) {
      return toggleTestAttribute(this as unknown as HTMLElement, name, force)
    },
    replaceChildren(next: typeof sheet) {
      sheet = next
    },
    mount(value: Page) {
      ;(this as { pageValue: Page }).pageValue = value
      Object.assign(globalThis, {
        document: {
          createElement(tag: string) {
            if (tag === 'iframe') return pageFrame()
            const createdSheet = {
              className: '',
              dir: '',
              style: {},
              frame: undefined as ReturnType<typeof pageFrame> | undefined,
              append(frame: ReturnType<typeof pageFrame>) {
                createdSheet.frame = frame
              },
            }
            return createdSheet
          },
        },
      })
      iframe = mountPageFrame(this as unknown as HTMLElement, value, undefined, '') as unknown as ReturnType<typeof pageFrame>
      return iframe
    },
    querySelector: (selector: string) => (selector === 'iframe' ? iframe : sheet),
    fit() {},
    writeDocument(frame: ReturnType<typeof pageFrame>, document: string) {
      frame.srcdoc = document
    },
    dispatchEvent(event: ErrorEvent) {
      errors.push(event.error)
      return true
    },
    load: (SegnaviaPage.prototype as unknown as { load(input: unknown): void }).load,
    loadValue: (SegnaviaPage.prototype as unknown as { loadValue(page: Page): void }).loadValue,
  } as unknown as { load(input: unknown): void; pageValue: Page; loadGeneration: number }
  Object.setPrototypeOf(page, SegnaviaPage.prototype)
  return { page, frame: () => iframe, errors }
}

describe('printed pages in SegnaviaPage', () => {
  test('lowers a printed Document and writes a one-column composed frame', async () => {
    const { page, frame, errors } = loadingHarness()
    page.load(printedDocument())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errors).toEqual([])
    expect(page.pageValue.printedPages).toBeDefined()
    expect(frame().srcdoc).toContain('"presentation":{"spread":false}')
    expect(frame().srcdoc).toContain('"pageMarker":"data-segnavia-printed-page"')
    expect(frame().getAttribute('sandbox')).toBe(frameSandbox('refuse'))
    expect(frame().getAttribute('sandbox')).not.toContain('allow-same-origin')
  })

  test('carries the host CSP into the composed frame', async () => {
    const { page, frame, errors } = loadingHarness()
    Object.assign(page, { cspExtra: 'img-src data:' })
    page.load(printedDocument())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errors).toEqual([])
    expect(frame().srcdoc).toMatch(/<meta http-equiv="Content-Security-Policy" content="[^"]*img-src data:/)
  })

  test('carries approved image origins into the composed frame', async () => {
    const { page, frame, errors } = loadingHarness()
    Object.assign(page, { origins: [{ origin: 'https://images.example', kinds: ['image'] }] })
    page.load(printedDocument())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errors).toEqual([])
    expect(frame().srcdoc).toMatch(/img-src [^;]*https:\/\/images\.example/)
  })

  test('resolves composed-paper placements for the screen surface', async () => {
    const purposes: string[] = []
    const { page, errors } = loadingHarness()
    Object.assign(page, {
      placementOptions: {
        resolve: async (_placement: unknown, context: { purpose: string }) => {
          purposes.push(context.purpose)
          return { kind: 'media', media: { format: 'png', size: { width: 20, height: 10 } }, src: 'data:image/png;base64,AA==' }
        },
      },
    })
    page.load(printedDocument('<img data-segnavia-media="cover">'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errors).toEqual([])
    expect(purposes).toEqual(['screen'])
  })

  test('carries an unsupplied declared face to the element font-failure report', async () => {
    const { page, frame, errors } = loadingHarness()
    const failures: unknown[] = []
    Object.assign(page, {
      fontOptions: { source: { font: async () => undefined } },
    })
    page.load({
      ...printedDocument(),
      style: { fonts: { body: { faces: [{}] } } },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const failure = { font: 'body', family: 'body', reason: 'unsupplied' }
    expect(errors).toEqual([])
    expect(frame().srcdoc).toContain(`initialFontFailures=[${JSON.stringify(failure)}]`)
    const element = new SegnaviaPage() as unknown as EventTarget & { onMessage(event: MessageEvent): void; querySelector(): unknown }
    Object.assign(element, { querySelector: () => frame() })
    element.addEventListener('fontfailure', (event: Event) => failures.push((event as CustomEvent).detail.failures))
    element.onMessage({
      source: frame().contentWindow,
      data: { type: MESSAGE.fontFailures, failures: [failure] },
    } as MessageEvent)
    expect(failures).toEqual([[failure]])
  })

  test('resolves font CSS and failures once across printed sections', async () => {
    const { page, frame, errors } = loadingHarness()
    const asked: string[] = []
    Object.assign(page, {
      fontOptions: {
        source: {
          font: async (name: string) => {
            asked.push(name)
            return {
              family: 'Body Serif',
              faces: [{ family: 'Body Serif', data: new Uint8Array([0]), format: 'truetype' as const }],
            }
          },
        },
      },
    })
    page.load({
      ...printedDocument(),
      style: { fonts: { body: { faces: [{}, { style: 'italic' as const }] } } },
      children: [
        { type: 'section', id: 'cover', children: [{ type: 'flow', html: '<p>Cover</p>' }] },
        { type: 'section', id: 'body', children: [{ type: 'flow', html: '<p>Body</p>' }] },
      ],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errors).toEqual([])
    expect(asked).toEqual(['body'])
    expect(frame().srcdoc.match(/@font-face\{font-family:"Body Serif"/g)).toHaveLength(1)
    expect(frame().srcdoc.match(/"reason":"unsupplied"/g)).toHaveLength(1)
  })

  test('reports slot filling and keeps composed papers unfilled', async () => {
    const slots = { fill: { id: 'held', values: { name: 'Filled' } } } satisfies SlotsOptions
    const { page, frame, errors } = loadingHarness(slots)
    page.load(printedDocument('<p data-slot-value="name">Authored</p>', true))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errors.map((error) => error.message)).toContain(
      'Cannot fill slots while showing composed papers. Remove the slots option or show a page without printedPages to clear this refusal.',
    )
    expect(frame().srcdoc).toContain('data-slot-value="name"')
    expect(frame().srcdoc).not.toContain('Filled')
  })

  test('does not refuse slot reporting without values to fill', async () => {
    const { page, errors } = loadingHarness({ report() {} })
    page.load(printedDocument('<p>Authored</p>', true))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(errors).toEqual([])
  })

  test('refuses selection and heading requests', async () => {
    const page = new SegnaviaPage()
    ;(page as unknown as { pageValue: Page }).pageValue = Page.parse({
      html: '<p>Paper</p>',
      print: { paper: 'letter' },
      printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
    })

    await expect(page.readSelection()).rejects.toThrow(
      'Cannot read the selection from composed papers. Show a page without printedPages to clear this refusal.',
    )
    await expect(page.scrollToHeading('chapter')).rejects.toThrow(
      'Cannot scroll to a heading in composed papers. Show a page without printedPages to clear this refusal.',
    )
  })

  test('reports a current composition failure and ignores a stale generation', () => {
    const frame = pageFrame()
    const errors: ErrorEvent[] = []
    const page = new SegnaviaPage() as unknown as {
      pageValue: Page
      loadGeneration: number
      composedFrame: { frame: ReturnType<typeof pageFrame>; generation: number }
      onMessage(event: MessageEvent): void
    }
    Object.assign(page, {
      pageValue: Page.parse({
        html: '<p>Paper</p>',
        print: { paper: 'letter' },
        printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
      }),
      loadGeneration: 2,
      composedFrame: { frame, generation: 1 },
      querySelector: () => frame,
      dispatchEvent(event: ErrorEvent) {
        errors.push(event)
        return true
      },
    })
    const failure = { source: frame.contentWindow, data: { type: MESSAGE.composeFailure, text: 'parent geometry was refused' } } as MessageEvent

    page.onMessage(failure)
    expect(errors).toEqual([])
    page.composedFrame.generation = 2
    page.onMessage(failure)
    expect(errors.map((event) => event.message)).toEqual(['parent geometry was refused'])
  })
})
