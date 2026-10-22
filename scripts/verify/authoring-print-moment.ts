import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

async function visiblePopoverControls(h: Harness, context: string, selector: string, controlSelectors: string[]) {
  const facts = await h.page.locator(`${PLAYER} segnavia-rail ${selector}`).evaluate((panel, selectors) => {
    const controls = selectors.map((selector) => panel.querySelector(selector))
    const viewport = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      let centre = document.elementFromPoint(x, y)
      while (centre?.shadowRoot) centre = centre.shadowRoot.elementFromPoint(x, y)
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && (centre === element || element.contains(centre))
    }
    return {
      panel: viewport(panel),
      controls: controls.map((control) => (control ? viewport(control) : false)),
      rect: panel.getBoundingClientRect().toJSON(),
    }
  }, controlSelectors)
  h.check(`${context} slide settings and controls stay visible`, facts.panel && facts.controls.every(Boolean), JSON.stringify(facts))
}

export async function verifyAuthoredPrintMoment(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('authoring-print-frames.html'))
  await page.waitForFunction(() => 'authoring' in window)
  const menuCount = () =>
    document.querySelector('segnavia-player')?.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot?.querySelectorAll('.slide-menu').length
  await page.waitForFunction(() => {
    const player = document.querySelector('segnavia-player') as HTMLElement & { controller: { state: { index: number } } }
    return player.controller.state.index === 0
  })
  check('script-refused thumbnails do not claim script-created animation', (await page.evaluate(menuCount)) === 0, String(await page.evaluate(menuCount)))
  await page.locator(PLAYER).evaluate(async (player) => {
    await (player as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(1)
  })
  await page.waitForFunction(() =>
    Boolean(
      document
        .querySelector('segnavia-player')
        ?.shadowRoot?.querySelector('segnavia-rail')
        ?.shadowRoot?.querySelector('li[data-slide-id="animated"] .slide-menu'),
    ),
  )
  await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"]`).hover()
  await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"] .slide-menu`).click()
  await page.locator(`${PLAYER} segnavia-rail .slide-settings-list button`).click()
  const animatedMax = await page.locator(`${PLAYER} segnavia-rail .print-frame-panel input`).getAttribute('max')
  check('a script-created animation reports its live length', animatedMax === '3000', String(animatedMax))
  await page.keyboard.press('Escape')
  await page.locator(PLAYER).evaluate(async (player) => {
    await (player as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(2)
  })
  await page.waitForFunction(
    () => document.querySelector('segnavia-player')?.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot?.querySelectorAll('.slide-menu').length === 2,
  )
  const controls = await page.locator(PLAYER).evaluate((player) => {
    const items = player.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot?.querySelectorAll<HTMLLIElement>('li[data-slide-id]') ?? []
    return [...items].map((item) => ({ id: item.dataset.slideId, menu: item.querySelector('.slide-menu')?.getAttribute('aria-label') ?? null }))
  })
  check(
    'only slides with an applicable setting have a menu',
    JSON.stringify(controls) ===
      JSON.stringify([
        { id: 'static', menu: null },
        { id: 'animated', menu: 'Slide settings' },
        { id: 'canvas', menu: 'Slide settings' },
      ]),
    JSON.stringify(controls),
  )

  const canvasMenu = page.locator(`${PLAYER} segnavia-rail li[data-slide-id="canvas"] .slide-menu`)
  await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="canvas"]`).hover()
  await canvasMenu.click()
  await visiblePopoverControls(h, 'wide rail list', '.slide-settings-list', ['[data-setting="print-frame"]'])
  await page.locator(`${PLAYER} segnavia-rail .slide-settings-list button`).click()
  const canvasMax = await page.locator(`${PLAYER} segnavia-rail .print-frame-panel input`).getAttribute('max')
  check('a canvas-only slide uses the ten second scrubber range', canvasMax === '10000', String(canvasMax))
  await page.keyboard.press('Escape')

  const animatedMenu = page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"] .slide-menu`)
  await animatedMenu.focus()
  await animatedMenu.press('Enter')
  const settingRow = page.locator(`${PLAYER} segnavia-rail .slide-settings-list [data-setting="print-frame"]`)
  check(
    'the settings list shows print frame and its current value',
    (await settingRow.textContent()) === 'Print frame · Start',
    String(await settingRow.textContent()),
  )
  await settingRow.press('Enter')
  const heading = page.locator(`${PLAYER} segnavia-rail .print-frame-panel h2`)
  const description = page.locator(`${PLAYER} segnavia-rail .print-frame-panel p`)
  check(
    'the print frame panel names and explains the setting',
    (await heading.textContent()) === 'Print frame' &&
      (await description.textContent()) === 'The moment this slide is frozen at when it is printed or exported to PDF.',
    `${await heading.textContent()} | ${await description.textContent()}`,
  )
  await page.locator(`${PLAYER} segnavia-rail [data-back]`).click()
  check('Back returns to the settings list', await settingRow.isVisible(), String(await settingRow.isVisible()))
  await settingRow.press('Enter')
  await visiblePopoverControls(h, 'wide rail panel', '.print-frame-panel', ['h2', 'p', 'output', 'input', '[data-back]', '[data-reset]', '[data-done]'])
  const slider = page.locator(`${PLAYER} segnavia-rail .print-frame-panel input`)
  await slider.press('ArrowRight')
  const hundredMillisecondDraft = await page.evaluate(
    () =>
      (window as unknown as { authoring: { draftDeck(): { slides: Array<{ id: string; printAtMs?: number }> } } }).authoring
        .draftDeck()
        .slides.find((slide) => slide.id === 'animated')?.printAtMs,
  )
  check('ArrowRight moves the print frame by 100 milliseconds', hundredMillisecondDraft === 100, String(hundredMillisecondDraft))
  await slider.press('Shift+ArrowRight')
  const oneSecondDraft = await page.evaluate(
    () =>
      (window as unknown as { authoring: { draftDeck(): { slides: Array<{ id: string; printAtMs?: number }> } } }).authoring
        .draftDeck()
        .slides.find((slide) => slide.id === 'animated')?.printAtMs,
  )
  check('Shift+ArrowRight moves the print frame by 1000 milliseconds', oneSecondDraft === 1100, String(oneSecondDraft))
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
  await page.locator(PLAYER).evaluate(async (player) => {
    const typed = player as HTMLElement & {
      transition: { kind: 'fade'; duration: number }
      controller: { go(index: number): Promise<void> }
    }
    typed.transition = { kind: 'fade', duration: 1000 }
    await typed.controller.go(2)
  })
  await page.waitForTimeout(30)
  check('controller navigation closes the slide settings panel', (await page.locator(`${PLAYER} segnavia-rail .print-frame-panel`).count()) === 0, '')
  const released = await page
    .frameLocator(liveAnimatedFrame)
    .locator('html')
    .evaluate(() => document.getAnimations()[0]?.playState)
  check('controller navigation releases the previous live animation', released === 'running', String(released))

  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferPrintMoment: boolean } }).authoringFacts.deferPrintMoment = true))
  await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"]`).hover()
  await animatedMenu.click()
  await page.locator(`${PLAYER} segnavia-rail .slide-settings-list button`).click()
  await page.locator(`${PLAYER} segnavia-rail .print-frame-panel input`).evaluate((input: HTMLInputElement) => {
    input.value = '1200'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator(`${PLAYER} segnavia-rail [data-done]`).click()
  const markLabel = await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"] .print-mark`).getAttribute('aria-label')
  check('the thumbnail print mark names the setting and value', markLabel === 'Print frame: 1.2 s', String(markLabel))
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

  const itemSettingsButton = page.locator(`${PLAYER} segnavia-rail .item-settings`)
  await itemSettingsButton.click()
  const openFacts = await page.evaluate(() => (window as unknown as { authoringFacts: { itemSettingsOpen: unknown[] } }).authoringFacts.itemSettingsOpen)
  check(
    'Item settings asks the host to open the current slide',
    JSON.stringify(openFacts) === JSON.stringify([{ slideId: 'animated' }]),
    JSON.stringify(openFacts),
  )
  const itemSetting = page.locator('segnavia-item-settings [data-setting="print-frame"]')
  check(
    'the Slide section shows Print frame for an animated slide',
    (await itemSetting.textContent()) === 'Print frame · 1.2 s',
    String(await itemSetting.textContent()),
  )
  await itemSetting.click()
  await page.locator('segnavia-item-settings .print-frame-panel input').evaluate((input: HTMLInputElement) => {
    input.value = '1500'
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.locator('segnavia-item-settings [data-done]').click()
  await page.waitForFunction(() => (window as unknown as { authoringFacts: { printSaves: unknown[] } }).authoringFacts.printSaves.length === 3)
  const sectionSaves = await page.evaluate(() => (window as unknown as { authoringFacts: { printSaves: unknown[] } }).authoringFacts.printSaves)
  check(
    'the Slide section saves once through the authoring queue',
    JSON.stringify(sectionSaves.at(-1)) === JSON.stringify({ slideId: 'animated', printAtMs: 1500 }),
    JSON.stringify(sectionSaves),
  )
  await page.locator(`${PLAYER} segnavia-rail li[data-slide-id="animated"]`).hover()
  await animatedMenu.click()
  const sharedValue = await page.locator(`${PLAYER} segnavia-rail .slide-settings-list [data-setting="print-frame"]`).textContent()
  check('the rail slide menu shows the value changed in the Slide section', sharedValue === 'Print frame · 1.5 s', String(sharedValue))
  await page.keyboard.press('Escape')

  await page.goto(h.url('authoring-rtl.html'))
  await page.waitForFunction(() => 'authoring' in window)
  await page.waitForFunction(
    () => document.querySelector('segnavia-player')?.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot?.querySelectorAll('.slide-menu').length === 1,
  )
  const rtlMenu = page.locator(`${PLAYER} segnavia-rail li[data-slide-id="probe"] .slide-menu`)
  await rtlMenu.focus()
  await rtlMenu.press('Enter')
  await visiblePopoverControls(h, 'RTL rail list', '.slide-settings-list', ['[data-setting="print-frame"]'])
  await page.locator(`${PLAYER} segnavia-rail .slide-settings-list button`).press('Enter')
  await visiblePopoverControls(h, 'RTL rail panel', '.print-frame-panel', ['h2', 'p', 'output', 'input', '[data-back]', '[data-reset]', '[data-done]'])
  await page.keyboard.press('Escape')

  await page.goto(h.url('authoring.html'))
  await page.waitForFunction(() => 'authoring' in window)
}
