import { expect, test } from 'bun:test'
import { bridgeForHost } from './bridge.ts'

function linkBridge(protocol: string, targets: Record<string, { scrollIntoView(): void }> = {}) {
  let click: ((event: { defaultPrevented: boolean; target: unknown; preventDefault(): void }) => void) | undefined
  let topScrolls = 0
  const document = {
    addEventListener: (name: string, listener: typeof click) => {
      if (name === 'click') click = listener
    },
    fonts: null,
    images: [],
    readyState: 'loading',
    getAnimations: () => [],
    getElementById: (id: string) => targets[id] ?? null,
    getElementsByTagName: () => [],
  }
  const window = { addEventListener: () => {} }
  Function(
    'document',
    'parent',
    'window',
    'location',
    'scrollTo',
    bridgeForHost({ reportHeight: false }),
  )(document, { postMessage() {} }, window, { protocol }, () => topScrolls++)
  return { click: () => click, topScrolls: () => topScrolls }
}

function anchor(href: string, parentElement: unknown = null) {
  return { tagName: 'A', parentElement, getAttribute: (name: string) => (name === 'href' ? href : null) }
}

function clickEvent(target: unknown, defaultPrevented = false) {
  return {
    defaultPrevented,
    target,
    preventDefault() {
      this.defaultPrevented = true
    },
  }
}

test('the in-page link listener is installed only in a srcdoc document', () => {
  expect(linkBridge('about:').click()).toBeFunction()
  expect(linkBridge('https:').click()).toBeUndefined()
})

test('an id fragment prevents navigation and scrolls its target', () => {
  let scrolls = 0
  const bridge = linkBridge('about:', { target: { scrollIntoView: () => scrolls++ } })
  const event = clickEvent({ tagName: 'SPAN', parentElement: anchor('#target') })
  bridge.click()?.(event)
  expect(event.defaultPrevented).toBe(true)
  expect(scrolls).toBe(1)
})

test('the top fragment prevents navigation and scrolls to the top', () => {
  const bridge = linkBridge('about:')
  const event = clickEvent(anchor('#ToP'))
  bridge.click()?.(event)
  expect(event.defaultPrevented).toBe(true)
  expect(bridge.topScrolls()).toBe(1)
})

test('an already prevented fragment click is left alone', () => {
  let scrolls = 0
  const bridge = linkBridge('about:', { target: { scrollIntoView: () => scrolls++ } })
  const event = clickEvent(anchor('#target'), true)
  bridge.click()?.(event)
  expect(event.defaultPrevented).toBe(true)
  expect(scrolls).toBe(0)
})

test('a non-fragment link is left alone', () => {
  const bridge = linkBridge('about:')
  const event = clickEvent(anchor('/elsewhere'))
  bridge.click()?.(event)
  expect(event.defaultPrevented).toBe(false)
  expect(bridge.topScrolls()).toBe(0)
})
