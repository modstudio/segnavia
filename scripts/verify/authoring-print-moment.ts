import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function verifyAuthoredPrintMoment(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('authoring-print-frames.html'))
  await page.waitForFunction(() => 'authoring' in window)
  await page.waitForFunction(
    () => document.querySelector('segnavia-player')?.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot?.querySelectorAll('.slide-menu').length === 2,
  )
  const controls = await page.locator(PLAYER).evaluate((player) => {
    const items = player.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot?.querySelectorAll<HTMLLIElement>('li') ?? []
    return [...items].map((item) => ({ id: item.dataset.slideId, menu: Boolean(item.querySelector('.slide-menu')) }))
  })
  check(
    'a static slide has no menu while animated and canvas slides do',
    JSON.stringify(controls) ===
      JSON.stringify([
        { id: 'static', menu: false },
        { id: 'animated', menu: true },
        { id: 'canvas', menu: true },
      ]),
    JSON.stringify(controls),
  )

  const canvasMenu = page.locator(`${PLAYER} segnavia-rail li[data-slide-id="canvas"] .slide-menu`)
  await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="canvas"]`).hover()
  await canvasMenu.click()
  await page.locator(`${PLAYER} segnavia-rail .print-menu-panel button`).click()
  const canvasMax = await page.locator(`${PLAYER} segnavia-rail .print-frame-panel input`).getAttribute('max')
  check('a canvas-only slide uses the ten second scrubber range', canvasMax === '10000', String(canvasMax))
  await page.keyboard.press('Escape')

  const animatedMenu = page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"] .slide-menu`)
  await animatedMenu.focus()
  await animatedMenu.press('Enter')
  await page.locator(`${PLAYER} segnavia-rail .print-menu-panel button`).press('Enter')
  const slider = page.locator(`${PLAYER} segnavia-rail .print-frame-panel input`)
  await slider.press('ArrowRight')
  const keyboardDraft = await page.evaluate(
    () =>
      (window as unknown as { authoring: { draftDeck(): { slides: Array<{ id: string; printAtMs?: number }> } } }).authoring
        .draftDeck()
        .slides.find((slide) => slide.id === 'animated')?.printAtMs,
  )
  check('the print frame menu and scrubber work from the keyboard', keyboardDraft === 1, String(keyboardDraft))
  await slider.evaluate((input: HTMLInputElement) => {
    input.value = '420'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const liveAnimatedFrame = `${PLAYER} segnavia-stage iframe[title$="slide 2"]`
  const frozen = await page
    .frameLocator(liveAnimatedFrame)
    .locator('html')
    .evaluate(() => Number(document.getAnimations()[0]?.currentTime))
  check('moving the scrubber freezes the live slide at that time', frozen === 420, String(frozen))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(30)
  const released = await page
    .frameLocator(liveAnimatedFrame)
    .locator('html')
    .evaluate(() => document.getAnimations()[0]?.playState)
  check('closing the scrubber releases the live animation', released === 'running', String(released))

  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferPrintMoment: boolean } }).authoringFacts.deferPrintMoment = true))
  await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"]`).hover()
  await animatedMenu.click()
  await page.locator(`${PLAYER} segnavia-rail .print-menu-panel button`).click()
  await page.locator(`${PLAYER} segnavia-rail .print-frame-panel input`).evaluate((input: HTMLInputElement) => {
    input.value = '1200'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator(`${PLAYER} segnavia-rail [data-done]`).click()
  await page.waitForFunction(() => (window as unknown as { authoringFacts: { printSaves: unknown[] } }).authoringFacts.printSaves.length === 2)
  const saveFacts = await page.evaluate(() => (window as unknown as { authoringFacts: { printSaves: unknown[] } }).authoringFacts.printSaves)
  check(
    'Done saves the chosen frame once',
    JSON.stringify(saveFacts.at(-1)) === JSON.stringify({ slideId: 'animated', printAtMs: 1200 }),
    JSON.stringify(saveFacts),
  )

  await page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const { printDeck } = (await import(bundle)) as { printDeck(deck: unknown, options: unknown): Promise<void> }
    const holder = window as unknown as { authoring: { draftDeck(): unknown }; authoredPrint?: Promise<void>; releaseAuthoredPrint?: () => void }
    holder.authoredPrint = printDeck(holder.authoring.draftDeck(), { print: () => new Promise<void>((resolve) => (holder.releaseAuthoredPrint = resolve)) })
  })
  await page.waitForFunction(() => typeof (window as unknown as { releaseAuthoredPrint?: unknown }).releaseAuthoredPrint === 'function')
  const printed = await page
    .frameLocator('body > iframe[style*="-20000px"]')
    .frameLocator('iframe')
    .nth(1)
    .locator('#print-target')
    .evaluate(() => Number(document.getAnimations()[0]?.currentTime))
  await page.evaluate(async () => {
    const holder = window as unknown as {
      authoredPrint: Promise<void>
      releaseAuthoredPrint(): void
      authoringFacts: { releasePrintMoment(): void }
    }
    holder.releaseAuthoredPrint()
    await holder.authoredPrint
    holder.authoringFacts.releasePrintMoment()
  })
  check('printing draftDeck freezes the printed slide at the chosen time', printed === 1200, String(printed))
}
