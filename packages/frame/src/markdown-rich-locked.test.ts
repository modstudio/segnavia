import { expect, test } from 'bun:test'

if (globalThis.document && !globalThis.document.documentElement) {
  Object.defineProperty(globalThis.document, 'documentElement', { configurable: true, value: { style: {} } })
}
const { isLockedToken, isSilentToken, lockedFenceLabel } = await import('./markdown-rich-locked.ts')

test('locked and silent markdown constructs share the reader rules', () => {
  expect(isLockedToken({ type: 'frontmatter', raw: '---\na: b\n---\n' })).toBe(true)
  expect(isLockedToken({ type: 'directive', raw: ':::note\nx\n:::\n' })).toBe(true)
  expect(isLockedToken({ type: 'code', raw: '```mermaid\nx\n```', lang: 'mermaid' })).toBe(true)
  expect(isLockedToken({ type: 'code', raw: '```ARTICLES\n```', lang: 'ARTICLES' }, { articles: 'Generated' })).toBe(true)
  expect(isLockedToken({ type: 'blockquote', raw: '> [!WARNING]\n> Stop' })).toBe(true)
  expect(isLockedToken({ type: 'html', raw: '<aside>raw</aside>' })).toBe(true)
  expect(isSilentToken({ type: 'html', raw: '<!-- carried -->' })).toBe(true)
  expect(isSilentToken({ type: 'def', raw: '[x]: /target' })).toBe(true)
})

test('locked fence labels use one case-insensitive lookup', () => {
  expect(lockedFenceLabel({ articles: 'Generated' }, 'ARTICLES')).toBe('Generated')
})
