import { expect, test } from 'bun:test'
import { layoutRuntimeScript, withLayoutScripts } from './layout-runtime.ts'

const scripts = [{ name: 'margin', script: 'segnaviaLayout.define({galley(){}})', priority: 1, order: 0, selects: '.note' }]

test('layout runtime injection is byte-neutral without providers and nonce-authorized when used', () => {
  const html = '<body><p>Text</p></body>'
  expect(withLayoutScripts(html, 'held', [])).toBe(html)
  const injected = withLayoutScripts(html, 'held', scripts)
  expect(injected).toContain('<script nonce="held">')
  expect(injected).toContain('segnaviaLayout.define({galley(){}})')
  expect(injected.indexOf('<script')).toBeLessThan(injected.indexOf('</body>'))
})

test('runtime carries the phase timeout and bounded layout report contract', () => {
  const runtime = layoutRuntimeScript(scripts)
  expect(runtime).toContain('10000')
  expect(runtime).toContain('reports.length >= 64')
  expect(runtime).toContain('check: "layout-report"')
  expect(runtime).toContain('registration.name}:${data?.subject')
})
