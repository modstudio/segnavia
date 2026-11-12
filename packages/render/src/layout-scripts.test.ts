import { afterEach, expect, test } from 'bun:test'
import { registerLayoutProvider, resetLayoutProvidersForTest } from '@segnavia/frame/layout'
import { RenderRefusedError } from './errors.ts'
import { layoutScripts } from './layout-scripts.ts'

afterEach(resetLayoutProvidersForTest)

test('render resolves only selected layout scripts and translates unknown names to a render refusal', async () => {
  registerLayoutProvider('known', { script: async () => 'KNOWN', priority: 0, selects: '.target' })
  expect(await layoutScripts('<p>plain</p>')).toEqual([])
  expect(await layoutScripts('<p data-segnavia-layout="known"></p>')).toEqual([{ name: 'known', script: 'KNOWN', priority: 0, order: 0, selects: '.target' }])
  expect(layoutScripts('<p data-segnavia-layout="missing"></p>')).rejects.toBeInstanceOf(RenderRefusedError)
})
