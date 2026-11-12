import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { renderPreparedPageImage } from './page-image-render.ts'

test('a growing page uses its measured height for the watermark media', async () => {
  const measuredHeight = 1_200
  let viewport = { width: 605, height: 800 }
  let watermarkMarkup = ''
  const root = {
    evaluate: async (callback: unknown) => (String(callback).includes('Promise.allSettled') ? [] : undefined),
    dispose: async () => {},
  }
  const tab = {
    viewportSize: () => viewport,
    setViewportSize: async (value: typeof viewport) => {
      viewport = value
    },
    evaluate: async (callback: unknown) => {
      const source = String(callback)
      if (source.includes('Math.max(document.documentElement.scrollHeight')) return measuredHeight
      if (source.includes('getComputedStyle')) return { fontFamily: 'serif', fontFaceCss: '' }
      return undefined
    },
    evaluateHandle: async (_callback: unknown, input: { html: string }) => {
      watermarkMarkup = input.html
      return root
    },
    screenshot: async () => new Uint8Array([1, 2, 3]),
  }
  const page = resolvePageHtml(Page.parse({ html: '<p>Growing page</p>', size: { width: 'full', height: 'auto' } }))

  await renderPreparedPageImage(
    {
      page,
      options: { format: 'png' },
      fontCss: '',
      fontFailures: [],
      established: { day: undefined, slots: undefined },
    } as never,
    { format: 'png', watermark: { text: 'Draft' } },
    { signal: AbortSignal.any([]), remaining: () => 1_000 },
    async (_setup, body) => body(tab as never),
  )

  expect(viewport.height).toBe(measuredHeight)
  expect(watermarkMarkup).toContain('height:900pt')
})
