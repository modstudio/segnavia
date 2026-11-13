import { expect, mock, test } from 'bun:test'
import type { RenderCall, Renderer } from './renderer.ts'

const browser = {
  isConnected: () => true,
  on: () => browser,
  off: () => browser,
  close: async () => {},
}

mock.module('playwright-core', () => ({ chromium: { launch: async () => browser } }))

const unknownOptionCases = [
  ['bookPdf', (renderer: Renderer) => renderer.bookPdf({} as never, { extra: true } as never)],
  ['bookPlan', (renderer: Renderer) => renderer.bookPlan({} as never, { extra: true } as never)],
  ['pagePdf', (renderer: Renderer) => renderer.pagePdf({} as never, { extra: true } as never)],
  ['pagesPdf', (renderer: Renderer) => renderer.pagesPdf([], { extra: true } as never)],
  ['pageImage', (renderer: Renderer) => renderer.pageImage({} as never, { extra: true } as never)],
  ['coverImage', (renderer: Renderer) => renderer.coverImage({} as never, { extra: true } as never)],
  ['deckPdf', (renderer: Renderer) => renderer.deckPdf({} as never, { extra: true } as never)],
  ['slideImage', (renderer: Renderer) => renderer.slideImage({} as never, 0, { extra: true } as never)],
  ['proofImage', (renderer: Renderer) => renderer.proofImage(new Uint8Array(), { extra: true } as never)],
] as const satisfies readonly [RenderCall, (renderer: Renderer) => Promise<unknown>][]

test.each(unknownOptionCases)('%s refuses an unknown option through the returned promise', async (call, render) => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    const rendered = render(renderer)
    expect(rendered).toBeInstanceOf(Promise)
    await expect(rendered).rejects.toThrow(`${call} options.extra: unknown option "extra"; remove it to clear this refusal`)
  } finally {
    await renderer.close()
  }
})
