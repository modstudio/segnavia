import { expect, test } from 'bun:test'
import { bridgeForHost, frameDocument } from './bridge.ts'

test('sandboxed scripts receive independent in-memory Storage properties', () => {
  const document = { addEventListener: () => {}, readyState: 'loading' }
  const window: Record<string, unknown> = { addEventListener: () => {} }
  Function('document', 'parent', 'window', 'Map', bridgeForHost({ reportHeight: false }))(document, { postMessage: () => {} }, window, Map)
  const local = window.localStorage as Storage
  const session = window.sessionStorage as Storage
  expect(local.length).toBe(0)
  expect(local.getItem('missing')).toBeNull()
  ;(local.setItem as (key: unknown, value: unknown) => void)('count', 3)
  ;(local.setItem as (key: unknown, value: unknown) => void)('other', true)
  expect(local.getItem('count')).toBe('3')
  expect(local.key(0)).toBe('count')
  expect(local.key(2)).toBeNull()
  expect(local.length).toBe(2)
  expect(session.getItem('count')).toBeNull()
  local.removeItem('count')
  expect(local.getItem('count')).toBeNull()
  local.clear()
  expect(local.length).toBe(0)
})

test('refused-script documents do not install storage', () => {
  const html = frameDocument('<p>x</p>', { scripts: 'refuse', nonce: 'n' })
  expect(html).not.toContain("Object.defineProperty(window,'localStorage'")
  expect(html).not.toContain("Object.defineProperty(window,'sessionStorage'")
})
