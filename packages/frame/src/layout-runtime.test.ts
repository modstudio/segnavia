import { expect, test } from 'bun:test'
import {
  boundPreflightReport,
  PREFLIGHT_ISSUES_PER_CHECK,
  PREFLIGHT_MESSAGE_LIMIT,
  PREFLIGHT_PRESETS,
  PREFLIGHT_SUBJECT_LIMIT,
} from '@segnavia/format'
import { LAYOUT_PHASE_TIMEOUT_MS } from './layout.ts'
import { installLayoutRuntime, layoutRuntimeScript, withLayoutScripts } from './layout-runtime.ts'

const scripts = [{ name: 'margin', script: 'segnaviaLayout.define({galley(){}})', priority: 1, order: 0, selects: '.note' }]

test('layout runtime injection is byte-neutral without providers and nonce-authorized when used', () => {
  const html = '<body><p>Text</p></body>'
  expect(withLayoutScripts(html, 'held', [])).toBe(html)
  const injected = withLayoutScripts(html, 'held', scripts)
  expect(injected).toContain('<script nonce="held">')
  expect(injected).toContain('segnaviaLayout.define({galley(){}})')
  expect(injected).toContain('function verticalWritingMode(')
  expect(injected.indexOf('<script nonce="held">')).toBeLessThan(injected.indexOf('<p>Text</p>'))
  const withAuthorScript = withLayoutScripts('<html><head><script>author()</script></head><body></body></html>', 'held', scripts)
  expect(withAuthorScript.indexOf('<script nonce="held">')).toBeLessThan(withAuthorScript.indexOf('<script>author()</script>'))
})

test('serialized provider registrations escape less-than characters', () => {
  const runtime = layoutRuntimeScript([{ ...scripts[0]!, selects: '[title="<"]' }])
  expect(runtime).toContain('title=\\"\\u003c\\"')
  expect(runtime).not.toContain('title=\\"<\\"')
})

function harness(names = ['first', 'second']) {
  const timers: Array<() => void> = []
  const target = {} as Window
  const document = { documentElement: {}, querySelectorAll: () => [] } as unknown as Document
  const runtime = installLayoutRuntime(
    target,
    document,
    ((callback: TimerHandler) => {
      timers.push(callback as () => void)
      return timers.length as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout,
    () => {},
    LAYOUT_PHASE_TIMEOUT_MS,
    names.map((name) => ({ name, selects: `.${name}` })),
    { issues: PREFLIGHT_ISSUES_PER_CHECK, subject: PREFLIGHT_SUBJECT_LIMIT, message: PREFLIGHT_MESSAGE_LIMIT },
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
  for (const name of ['priority', 'tie-first', 'tie-second'])
    define(name, {
      galley: async () => {
        calls.push(name)
      },
    })
  await runtime.run('galley')
  await runtime.run('galley')
  expect(calls).toEqual(['priority', 'tie-first', 'tie-second'])
})

test.each([
  [
    'throws',
    () => {
      throw new Error('broken')
    },
  ],
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
  expect(pending).rejects.toThrow(`Layout provider margin did not settle its composed phase within ${LAYOUT_PHASE_TIMEOUT_MS}ms`)
})

test('reports are prefixed and bounded in the frame and bounded again by the host', async () => {
  const { runtime, define } = harness(['margin'])
  define('margin', {
    galley(context) {
      for (let index = 0; index < PREFLIGHT_ISSUES_PER_CHECK + 6; index++)
        context.report({
          subject: `${index}:${'s'.repeat(PREFLIGHT_SUBJECT_LIMIT + 44)}`,
          message: 'm'.repeat(PREFLIGHT_MESSAGE_LIMIT + 176),
        })
    },
  })
  await runtime.run('galley')
  expect(runtime.reports()).toHaveLength(PREFLIGHT_ISSUES_PER_CHECK)
  expect(runtime.reports()[0]?.subject).toHaveLength(PREFLIGHT_SUBJECT_LIMIT)
  expect(runtime.reports()[0]?.subject.startsWith('margin:')).toBe(true)
  expect(runtime.reports()[0]?.message).toHaveLength(PREFLIGHT_MESSAGE_LIMIT)
  const hostile = runtime.reports().map((issue) => ({ ...issue, subject: `${issue.subject}extra`, message: `${issue.message}extra` }))
  const bounded = boundPreflightReport({ entries: [...hostile, ...hostile], facts: {} }, PREFLIGHT_PRESETS.default)
  expect(bounded.issues).toHaveLength(PREFLIGHT_ISSUES_PER_CHECK)
  expect(bounded.issues[0]?.subject).toHaveLength(PREFLIGHT_SUBJECT_LIMIT)
  expect(bounded.issues[0]?.message).toHaveLength(PREFLIGHT_MESSAGE_LIMIT)
})

test('a throwing provider script does not stop a later definition and its refusal names the failed provider', async () => {
  const target = {} as Window & { laterLoaded?: boolean }
  const document = { querySelectorAll: () => [] } as unknown as Document
  const generated = layoutRuntimeScript([
    { name: 'broken', script: 'throw new Error("top-level")', priority: 0, order: 0, selects: '.broken' },
    {
      name: 'later',
      script: 'window.laterLoaded=true;window.segnaviaLayout.define({galley(){}})',
      priority: 0,
      order: 1,
      selects: '.later',
    },
  ])
  Function('window', 'document', 'setTimeout', 'clearTimeout', generated)(target, document, setTimeout, clearTimeout)
  expect(target.laterLoaded).toBe(true)
  await expect(target.segnaviaLayout?.run('galley')).rejects.toThrow('Layout provider broken failed to load: top-level')
})

test('ink searches every selected element and refuses a missing string', async () => {
  const text = { textContent: 'wanted', nodeType: 3, parentElement: undefined }
  const first = { id: 'first' } as unknown as Element
  const second = { id: 'second' } as unknown as Element
  const range = {
    startContainer: text,
    endContainer: text,
    startOffset: 0,
    endOffset: 6,
    setStart() {},
    setEnd() {},
    getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }),
  }
  const document = {
    body: first,
    documentElement: {},
    querySelectorAll: () => [first, second],
    createRange: () => range,
    createTreeWalker: (element: Element) => {
      let read = false
      return { nextNode: () => (read ? null : ((read = true), element === second ? text : null)) }
    },
  } as unknown as Document
  const previous = { DOMRect: Reflect.get(globalThis, 'DOMRect'), NodeFilter: Reflect.get(globalThis, 'NodeFilter') }
  Object.assign(globalThis, {
    DOMRect: class {
      constructor(
        readonly x: number,
        readonly y: number,
        readonly width: number,
        readonly height: number,
      ) {}
    },
    NodeFilter: { SHOW_TEXT: 4 },
  })
  try {
    const runtime = installLayoutRuntime(
      {} as Window,
      document,
      setTimeout,
      clearTimeout,
      LAYOUT_PHASE_TIMEOUT_MS,
      [{ name: 'search', selects: '*' }],
      { issues: PREFLIGHT_ISSUES_PER_CHECK, subject: PREFLIGHT_SUBJECT_LIMIT, message: PREFLIGHT_MESSAGE_LIMIT },
      () => [],
      () => 3,
      () => ({ block: 0, inline: 0 }),
    )
    runtime._loading = 'search'
    let found: DOMRect | undefined
    runtime.define({ galley: (context) => void (found = context.ink('wanted')) })
    runtime._loading = undefined
    await runtime.run('galley')
    expect(found?.width).toBe(3)
    runtime._loading = 'search'
    runtime.define({ composed: (context) => void context.ink('missing') })
    runtime._loading = undefined
    await expect(runtime.run('composed')).rejects.toThrow('ink could not find "missing" in the selected elements')
  } finally {
    Object.assign(globalThis, previous)
  }
})
