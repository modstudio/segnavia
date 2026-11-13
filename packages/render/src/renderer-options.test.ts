import { expect, mock, test } from 'bun:test'
import { RENDER_OPTION_KEYS } from './render-option-keys.ts'
import type { RenderCall, Renderer } from './renderer.ts'

const browser = {
  isConnected: () => true,
  on: () => browser,
  off: () => browser,
  close: async () => {},
}

mock.module('playwright-core', () => ({ chromium: { launch: async () => browser } }))

const unknownOptionCalls = Object.keys(RENDER_OPTION_KEYS) as RenderCall[]

function renderWithUnknownOption(renderer: Renderer, call: RenderCall): Promise<unknown> {
  switch (call) {
    case 'bookPdf':
      return renderer.bookPdf({} as never, { extra: true } as never)
    case 'bookPlan':
      return renderer.bookPlan({} as never, { extra: true } as never)
    case 'pagePdf':
      return renderer.pagePdf({} as never, { extra: true } as never)
    case 'pagesPdf':
      return renderer.pagesPdf([], { extra: true } as never)
    case 'pageImage':
      return renderer.pageImage({} as never, { extra: true } as never)
    case 'coverImage':
      return renderer.coverImage({} as never, { extra: true } as never)
    case 'deckPdf':
      return renderer.deckPdf({} as never, { extra: true } as never)
    case 'slideImage':
      return renderer.slideImage({} as never, 0, { extra: true } as never)
    case 'proofImage':
      return renderer.proofImage(new Uint8Array(), { extra: true } as never)
    default: {
      const unhandledCall: never = call
      return unhandledCall
    }
  }
}

test.each(unknownOptionCalls)('%s refuses an unknown option through the returned promise', async (call) => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    const rendered = renderWithUnknownOption(renderer, call)
    expect(rendered).toBeInstanceOf(Promise)
    await expect(rendered).rejects.toThrow(`${call} options.extra: unknown option "extra"; remove it to clear this refusal`)
  } finally {
    await renderer.close()
  }
})
