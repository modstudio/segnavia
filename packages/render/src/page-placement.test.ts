import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { SoundPrintRefusedError } from '@segnavia/html'
import { prepareRenderedPageValue } from './page-document.ts'

test('render page preparation resolves placed media with the requested purpose', async () => {
  const purposes: string[] = []
  const prepared = await prepareRenderedPageValue(
    Page.parse({ html: '<img data-segnavia-media="cover">', size: { width: 320, height: 200 } }),
    {
      placements: {
        resolve: async (_placement, context) => {
          purposes.push(context.purpose)
          return {
            kind: 'media',
            media: { format: 'png', size: { width: 20, height: 10 } },
            src: 'data:image/png;base64,AA==',
          }
        },
      },
    },
    undefined,
    new AbortController().signal,
    { day: { date: '2026-11-14', zone: 'UTC', kind: 'current' }, slots: {} },
    'screen',
  )
  expect(prepared.page.html).toContain('src="data:image/png;base64,AA=="')
  expect(purposes).toEqual(['screen'])
})

test('print preparation propagates a typed sound refusal before a placeholder', async () => {
  const prepared = prepareRenderedPageValue(
    Page.parse({ html: '<img data-segnavia-media="theme">', size: { width: 320, height: 200 } }),
    {
      placements: {
        resolve: async () => ({ kind: 'sound', sound: { format: 'mp3', durationMs: 1_000 }, src: 'data:audio/mpeg,x' }),
      },
    },
    undefined,
    new AbortController().signal,
    { day: { date: '2026-11-14', zone: 'UTC', kind: 'current' }, slots: {} },
    'print',
  )
  await expect(prepared).rejects.toBeInstanceOf(SoundPrintRefusedError)
  await expect(prepared).rejects.toThrow('Placement theme holds a sound, which cannot print')
})
