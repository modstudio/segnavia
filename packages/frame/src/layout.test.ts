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
