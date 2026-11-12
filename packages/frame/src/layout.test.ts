import { afterEach, expect, test } from 'bun:test'
import { layoutsUsed, loadLayoutScripts, registerLayoutProvider, resetLayoutProvidersForTest } from './layout.ts'

afterEach(resetLayoutProvidersForTest)

test('layout providers replace in place and load by priority then first registration', async () => {
  registerLayoutProvider('later', { script: async () => 'LATER', priority: 2, selects: '.later' })
  registerLayoutProvider('first', { script: async () => 'OLD', priority: 1, selects: '.old' })
  registerLayoutProvider('second', { script: async () => 'SECOND', priority: 1, selects: '.second' })
  registerLayoutProvider('first', { script: async () => 'REPLACED', priority: 1, selects: '.first' })

  expect(await loadLayoutScripts('<main data-segnavia-layout="later first second"></main>')).toEqual([
    { name: 'first', script: 'REPLACED', priority: 1, order: 1, selects: '.first' },
    { name: 'second', script: 'SECOND', priority: 1, order: 2, selects: '.second' },
    { name: 'later', script: 'LATER', priority: 2, order: 0, selects: '.later' },
  ])
})

test('layout loading is byte-neutral without a selection and refuses unknown names with the remedy', async () => {
  registerLayoutProvider('known', { script: async () => 'KNOWN', priority: 0, selects: '*' })
  expect(layoutsUsed('<p data-segnavia-layout="known known">x</p>')).toEqual(['known'])
  expect(await loadLayoutScripts('<p>plain</p>')).toEqual([])
  expect(loadLayoutScripts('<p data-segnavia-layout="missing"></p>')).rejects.toThrow('registerLayoutProvider("missing", …)')
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
