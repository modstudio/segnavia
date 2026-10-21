import type { Harness } from './harness.ts'

export async function verifySlots(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('slots.html'))
  await page.waitForFunction(
    () =>
      'slotFacts' in window &&
      'slotPrintFacts' in window &&
      document.querySelectorAll('#mina iframe').length === 2 &&
      document.querySelector('#filled-deck-thumbnail')?.shadowRoot?.querySelector('iframe'),
  )
  const facts = await page.evaluate(() => {
    const logo = document.querySelector<HTMLIFrameElement>('#mina iframe')?.getAttribute('srcdoc')
    const exposed = window as unknown as {
      slotFacts: {
        reports: Array<{ fill: string | null; slots: Record<string, string> }>
        refuseError?: string
        failedAsset?: { slots: Record<string, string> }
      }
      slotPrintFacts: string
    }
    const shrink = document.querySelector<HTMLIFrameElement>('#shrink-card iframe')?.getAttribute('srcdoc')
    return { logo, shrink, ...exposed.slotFacts, printed: exposed.slotPrintFacts }
  })
  const frameText = async (selector: string) => {
    const frames = page.locator(selector)
    const text: string[] = []
    for (let index = 0; index < (await frames.count()); index++) text.push(await frames.nth(index).contentFrame().locator('body').innerText())
    return text
  }
  const mina = await frameText('#mina iframe')
  const noah = await frameText('#noah iframe')
  const unfilled = await frameText('#unfilled iframe')
  const thumbnail = await frameText('#filled-thumbnail iframe')
  const deckThumbnail = await frameText('#filled-deck-thumbnail iframe')
  check('two fills render different text on the same two-sided card', mina.join(' ').includes('<em>Mina Patel</em>') && noah.join(' ').includes('Noah Kim'))
  check('an unfilled slot keeps the design text', unfilled.join(' ').includes('Design Name'))
  check(
    'an asset reference resolves to a data URL and a failed reference reports unavailable',
    facts.logo?.includes('data:image/svg+xml') === true && facts.failedAsset?.slots.logo === 'unavailable',
  )
  check(
    'slot markup renders as literal text in viewers and thumbnails',
    mina.join(' ').includes('<em>Mina Patel</em>') && thumbnail.join(' ').includes('<em>Mina Patel</em>'),
  )
  check('a deck thumbnail renders its filled slot value', deckThumbnail.join(' ').includes('<em>Mina Patel</em>'))
  check('printPages prints filled values', facts.printed.includes('Noah Kim') && facts.printed.includes('noah@example.com'))
  check(
    'a long shrinking business-card name reports shrunk',
    facts.reports.some((report) => report.fill === 'long-print' && report.slots.name === 'shrunk'),
    JSON.stringify({ reports: facts.reports.filter((report) => report.fill === 'long-print'), marked: facts.shrink?.includes('data-slot-overflow') }),
  )
  check('an overflowed refuse slot blocks printPages with the named error', facts.refuseError?.includes('"name" (overflowed)') === true)
}
