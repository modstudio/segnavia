import { afterEach, expect, test } from 'bun:test'
import { hasLayoutProvider, layoutsUsed, loadLayoutScripts, registerLayoutProvider, resetLayoutProvidersForTest } from './layout.ts'

afterEach(resetLayoutProvidersForTest)

test('layout providers replace in place and load by priority then first registration', async () => {
  registerLayoutProvider('later', { script: async () => 'LATER', priority: 2, selects: '[data-later]' })
  registerLayoutProvider('first', { script: async () => 'OLD', priority: 1, selects: '[data-old]' })
  registerLayoutProvider('second', { script: async () => 'SECOND', priority: 1, selects: '[data-second]' })
  registerLayoutProvider('first', { script: async () => 'REPLACED', priority: 1, selects: '[data-first]' })

  expect(await loadLayoutScripts('<main data-segnavia-layout="later first second"></main>')).toEqual([
    { name: 'first', script: 'REPLACED', priority: 1, order: 1, selects: '[data-first]' },
    { name: 'second', script: 'SECOND', priority: 1, order: 2, selects: '[data-second]' },
    { name: 'later', script: 'LATER', priority: 2, order: 0, selects: '[data-later]' },
  ])
})

test('layout loading is byte-neutral without a selection and refuses unknown names with the remedy', async () => {
  registerLayoutProvider('known', { script: async () => 'KNOWN', priority: 0, selects: '[data-known]' })
  expect(layoutsUsed('<p data-segnavia-layout="known known">x</p>')).toEqual(['known'])
  expect(await loadLayoutScripts('<p>plain</p>')).toEqual([])
  expect(loadLayoutScripts('<p data-segnavia-layout="missing"></p>')).rejects.toThrow('registerLayoutProvider("missing", …)')
})

test('the shared registry reports whether a provider is registered', () => {
  expect(hasLayoutProvider('known')).toBe(false)
  registerLayoutProvider('known', { script: async () => 'KNOWN' })
  expect(hasLayoutProvider('known')).toBe(true)
  resetLayoutProvidersForTest()
  expect(hasLayoutProvider('known')).toBe(false)
})

test('a library marker refuses an unregistered provider with its remedy', async () => {
  const diagram = '<pre data-segnavia-diagram="mermaid"><code>flowchart TD</code></pre>'
  expect(layoutsUsed(diagram)).toEqual(['diagram'])
  expect(loadLayoutScripts(diagram)).rejects.toThrow(
    "Call registerDiagramProvider(diagrams) from '@segnavia/frame/diagrams', or import '@segnavia/diagrams/auto'",
  )
})

test('library marker text inside a code sample selects no provider', async () => {
  const sample = '<code>&lt;pre data-segnavia-diagram="mermaid"&gt;&lt;/pre&gt;</code>'
  expect(layoutsUsed(sample)).toEqual([])
  expect(await loadLayoutScripts(sample)).toEqual([])
})

test('layout selection reads only real author attributes in every HTML attribute form', () => {
  expect(layoutsUsed('<p data-segnavia-layout=one></p><p\n data-segnavia-layout="two three"></p>')).toEqual(['one', 'two', 'three'])
  expect(
    layoutsUsed(
      '<!-- <p data-segnavia-layout="comment"> --><script>"data-segnavia-layout=script"</script><style>[data-segnavia-layout="style"]{}</style><code>&lt;p data-segnavia-layout="code"&gt;</code>',
    ),
  ).toEqual([])
})

test('layout loading refuses a closing script sequence and names the provider', async () => {
  registerLayoutProvider('unsafe', { script: async () => 'use();</ScRiPt><p>' })
  expect(loadLayoutScripts('<p data-segnavia-layout=unsafe></p>')).rejects.toThrow(
    'Layout provider unsafe returned a script containing </script; remove or escape that sequence',
  )
})

test('registration defaults priority and the content selector', async () => {
  registerLayoutProvider('margin', { script: async () => 'MARGIN' })
  expect(await loadLayoutScripts('<aside data-segnavia-layout="margin"></aside>')).toEqual([
    { name: 'margin', script: 'MARGIN', priority: 0, order: 0, selects: '[data-segnavia-layout~="margin"]' },
  ])
})

test('a constrained compound selector discovers a provider from parsed elements', async () => {
  registerLayoutProvider('diagram', { script: async () => 'DRAW', selects: 'pre[data-kind][data-format="mermaid"][class~="drawing"]' })
  expect(layoutsUsed('<pre class="drawing wide" data-kind data-format="mermaid"></pre>')).toEqual(['diagram'])
  expect(layoutsUsed('<div class="drawing" data-kind data-format="mermaid"></div>')).toEqual([])
  expect(layoutsUsed('<!-- <pre class="drawing" data-kind data-format="mermaid"> -->')).toEqual([])
})

test('registration refuses selectors outside the provider grammar', () => {
  expect(() => registerLayoutProvider('bad', { script: async () => '', selects: 'main > p' })).toThrow('one compound tag and attribute selector')
  expect(() => registerLayoutProvider('bad', { script: async () => '', selects: '.class' })).toThrow('one compound tag and attribute selector')
})
