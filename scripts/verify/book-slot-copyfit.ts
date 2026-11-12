import type { Frame } from 'playwright-core'
import type { Harness } from './harness.ts'

export async function copyfitFrame(h: Harness, id: string): Promise<Frame> {
  const handle = await h.page.$(`#${id}`)
  const frame = await handle?.contentFrame()
  if (!frame) throw new Error(`The copyfit frame ${id} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  return frame
}

export async function verifyBookSlotCopyfit(h: Harness): Promise<void> {
  await h.page.goto(h.url('book-copyfit.html'))
  const slot = await (await copyfitFrame(h, 'copyfit-slot')).evaluate(() => {
    const copies = Array.from(document.querySelectorAll<HTMLElement>('[data-segnavia-book-page] [data-slot-overflow]')).map((element) => ({
      page: element.closest('[data-segnavia-book-page]')?.getAttribute('data-segnavia-book-page'),
      size: Number.parseFloat(getComputedStyle(element).fontSize),
      width: element.getBoundingClientRect().width,
    }))
    return { copies, pages: new Set(copies.map((copy) => copy.page)).size }
  })
  const slotSizes = new Set(slot.copies.map((copy) => copy.size))
  const slotWidths = new Set(slot.copies.map((copy) => copy.width))
  h.check(
    'a slot shrunk in a composed book has the same size on every page copy',
    slot.pages >= 2 && slotWidths.size >= 2 && slotSizes.size === 1,
    JSON.stringify(slot),
  )
}
