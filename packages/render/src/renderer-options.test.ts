import { expect, mock, test } from 'bun:test'

const browser = {
  isConnected: () => true,
  on: () => browser,
  off: () => browser,
  close: async () => {},
}

mock.module('playwright-core', () => ({ chromium: { launch: async () => browser } }))

test('bookPdf refuses an unknown option with its call and key', async () => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    await expect(renderer.bookPdf({} as never, { foo: 1 } as never)).rejects.toThrow(
      'bookPdf options.foo: unknown option "foo"; remove it to clear this refusal',
    )
  } finally {
    await renderer.close()
  }
})
