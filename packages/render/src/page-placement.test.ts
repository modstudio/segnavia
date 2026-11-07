import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
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
    'screen',
  )
  expect(prepared.page.html).toContain('src="data:image/png;base64,AA=="')
  expect(purposes).toEqual(['screen'])
})
