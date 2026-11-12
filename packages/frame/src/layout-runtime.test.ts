import { expect, test } from 'bun:test'
import { boundPreflightReport, PREFLIGHT_PRESETS } from '@segnavia/format'
import { installLayoutRuntime, withLayoutScripts } from './layout-runtime.ts'

const scripts = [{ name: 'margin', script: 'segnaviaLayout.define({galley(){}})', priority: 1, order: 0, selects: '.note' }]

test('layout runtime injection is byte-neutral without providers and nonce-authorized when used', () => {
  const html = '<body><p>Text</p></body>'
  expect(withLayoutScripts(html, 'held', [])).toBe(html)
  const injected = withLayoutScripts(html, 'held', scripts)
  expect(injected).toContain('<script nonce="held">')
  expect(injected).toContain('segnaviaLayout.define({galley(){}})')
  expect(injected.indexOf('<script')).toBeLessThan(injected.indexOf('</body>'))
})

function harness(names = ['first', 'second']) {
  const timers: Array<() => void> = []
  const target = {} as Window
  const document = { documentElement: {}, querySelectorAll: () => [] } as unknown as Document
  const runtime = installLayoutRuntime(
    target,
    document,
    (callback) => {
      timers.push(callback as () => void)
      return timers.length as unknown as ReturnType<typeof setTimeout>
    },
    () => {},
    10_000,
    names.map((name) => ({ name, selects: `.${name}` })),
  )
  const define = (name: string, implementation: Parameters<typeof runtime.define>[0]) => {
    runtime._loading = name
    runtime.define(implementation)
    runtime._loading = undefined
  }
  return { runtime, define, expire: () => timers.at(-1)?.() }
}

test('providers run sequentially in registration order and a phase runs once', async () => {
  const { runtime, define } = harness(['priority', 'tie-first', 'tie-second'])
  const calls: string[] = []
  for (const name of ['priority', 'tie-first', 'tie-second']) define(name, { galley: async () => calls.push(name) })
  await runtime.run('galley')
  await runtime.run('galley')
  expect(calls).toEqual(['priority', 'tie-first', 'tie-second'])
})

test.each([
  ['throws', () => { throw new Error('broken') }],
  ['rejects', () => Promise.reject(new Error('broken'))],
] as const)('a provider that %s refuses with its name and phase', async (_kind, run) => {
  const { runtime, define } = harness(['margin'])
  define('margin', { galley: run })
  expect(runtime.run('galley')).rejects.toThrow('Layout provider margin refused its galley phase: broken')
})

test('a provider timeout uses the injected clock and names its phase', async () => {
  const { runtime, define, expire } = harness(['margin'])
  define('margin', { composed: () => new Promise(() => {}) })
  const pending = runtime.run('composed')
  await Promise.resolve()
  await Promise.resolve()
  expire()
  expect(pending).rejects.toThrow('Layout provider margin did not settle its composed phase within 10000ms')
})

test('reports are prefixed and bounded in the frame and bounded again by the host', async () => {
  const { runtime, define } = harness(['margin'])
  define('margin', {
    galley(context) {
      for (let index = 0; index < 70; index++) context.report({ subject: `${index}:${'s'.repeat(300)}`, message: 'm'.repeat(1200) })
    },
  })
  await runtime.run('galley')
  expect(runtime.reports()).toHaveLength(64)
  expect(runtime.reports()[0]?.subject).toHaveLength(256)
  expect(runtime.reports()[0]?.subject.startsWith('margin:')).toBe(true)
  expect(runtime.reports()[0]?.message).toHaveLength(1024)
  const hostile = runtime.reports().map((issue) => ({ ...issue, subject: `${issue.subject}extra`, message: `${issue.message}extra` }))
  const bounded = boundPreflightReport({ entries: [...hostile, ...hostile], facts: {} }, PREFLIGHT_PRESETS.default)
  expect(bounded.issues).toHaveLength(64)
  expect(bounded.issues[0]?.subject).toHaveLength(256)
  expect(bounded.issues[0]?.message).toHaveLength(1024)
})
