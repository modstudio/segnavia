import { expect, test } from 'bun:test'
import { bridgeForHost, frameDocument, HEADING_ID_LIMIT, headingMessage, MESSAGE } from './bridge.ts'

function runHeadingBridge(
  headings: Array<{ id: string; getBoundingClientRect(): { top: number } }>,
  data: unknown,
  source: 'parent' | 'other',
  allElements = headings,
): unknown[] {
  const messages: unknown[] = []
  const parent = { postMessage: (message: unknown) => messages.push(message) }
  const messageListeners: Array<(event: { data: unknown; source: unknown }) => void> = []
  const window = {
    addEventListener(name: string, listener: (event: { data: unknown; source: unknown }) => void) {
      if (name === 'message') messageListeners.push(listener)
    },
  }
  const document = {
    addEventListener: () => {},
    documentElement: {},
    fonts: null,
    images: [],
    querySelectorAll: (selector: string) => (selector === 'h1,h2,h3,h4,h5,h6' ? headings : selector === '*' ? allElements : []),
    readyState: 'loading',
    scrollingElement: { scrollTop: 0 },
  }
  const html = frameDocument('<p>Page</p>', { scripts: 'refuse', nonce: 'n', reportHeight: false })
  const script = html.match(/<script nonce="n">([\s\S]*?)<\/script>/)?.[1] ?? ''
  Function('document', 'parent', 'window', 'MutationObserver', script)(document, parent, window, undefined)
  for (const listener of messageListeners) listener({ data, source: source === 'parent' ? parent : {} })
  return messages
}

test('only refused-script documents answer a bounded parent heading request', () => {
  const refused = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n' })
  expect(refused).toContain(MESSAGE.headingRequest)
  expect(frameDocument('<p>x</p>', { scripts: 'sandboxed', nonce: 'n' })).not.toContain(MESSAGE.headingRequest)
  expect(bridgeForHost()).not.toContain(MESSAGE.headingRequest)
})

test('heading requests trust the parent and bound the request payload', () => {
  let top = 80
  const heading = {
    id: 'chapter',
    getBoundingClientRect: () => {
      const measured = top
      top = 0
      return { top: measured }
    },
  }
  expect(runHeadingBridge([heading], { type: MESSAGE.headingRequest, id: 1, heading: 'chapter' }, 'parent')).toEqual([{ type: MESSAGE.heading, id: 1, top: 0 }])
  expect(runHeadingBridge([heading], { type: MESSAGE.headingRequest, id: 1, heading: 'chapter' }, 'other')).toEqual([])
  expect(runHeadingBridge([heading], { type: MESSAGE.headingRequest, id: 1, heading: 'x'.repeat(HEADING_ID_LIMIT + 1) }, 'parent')).toEqual([])
  expect(runHeadingBridge([heading], { type: MESSAGE.headingRequest, id: Number.POSITIVE_INFINITY, heading: 'chapter' }, 'parent')).toEqual([])
})

test('a heading request ignores a non-heading with the requested id', () => {
  const nonHeading = { id: 'chapter', getBoundingClientRect: () => ({ top: 0 }) }
  expect(runHeadingBridge([], { type: MESSAGE.headingRequest, id: 2, heading: 'chapter' }, 'parent', [nonHeading])).toEqual([
    { type: MESSAGE.heading, id: 2, top: null },
  ])
})

test('heading replies match their frame and request and carry only finite tops or null', () => {
  const source = {} as Window
  const frame = { contentWindow: source } as HTMLIFrameElement
  const event = (data: unknown, eventSource: MessageEventSource | null = source) => ({ source: eventSource, data }) as MessageEvent
  expect(headingMessage(event({ type: MESSAGE.heading, id: 7, top: 42 }), frame, 7)).toBe(42)
  expect(headingMessage(event({ type: MESSAGE.heading, id: 7, top: null }), frame, 7)).toBeNull()
  expect(headingMessage(event({ type: MESSAGE.heading, id: 7, top: 42 }, {} as Window), frame, 7)).toBeUndefined()
  expect(headingMessage(event({ type: MESSAGE.heading, id: 8, top: 42 }), frame, 7)).toBeUndefined()
  expect(headingMessage(event({ type: MESSAGE.heading, id: 7, top: Number.NaN }), frame, 7)).toBeUndefined()
})
