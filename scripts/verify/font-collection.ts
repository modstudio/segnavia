import type { Harness } from './harness.ts'

export async function verifyFontCollection(h: Harness): Promise<void> {
  const { page, check } = h
  await page.goto(h.url('font-collection.html'))
  await page.evaluate(() => document.fonts.ready)
  const collectionInk = await page.locator('.collection').screenshot()
  const standaloneInk = await page.locator('.standalone').screenshot()
  check('a collection face has the same glyph ink as its standalone face', collectionInk.equals(standaloneInk))
}
