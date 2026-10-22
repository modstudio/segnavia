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
  await page.evaluate(() => {
    const probe = document.createElement('segnavia-page') as HTMLElement & { page: unknown }
    probe.id = 'authored-overflow-marker'
    probe.page = {
      size: { width: 100, height: 100 },
      scripts: 'refuse',
      html: '<div data-slot-overflow="x:shrink:-1e308" style="width:1px;height:1px;overflow:hidden"><span style="display:block;width:100px;height:100px"></span></div>',
    }
    window.addEventListener('message', (event) => {
      const frame = probe.querySelector('iframe')
      if (frame?.contentWindow === event.source && event.data?.type === 'segnavia:ready')
        (window as typeof window & { authoredOverflowMarkerReady?: boolean }).authoredOverflowMarkerReady = true
    })
    document.body.append(probe)
  })
  await page.waitForFunction(() => (window as typeof window & { authoredOverflowMarkerReady?: boolean }).authoredOverflowMarkerReady === true)
  const facts = await page.evaluate(() => {
    const logo = document.querySelector<HTMLIFrameElement>('#mina iframe')?.getAttribute('srcdoc')
    const exposed = window as unknown as {
      slotFacts: {
        reports: Array<{ fill: string | null; slots: Record<string, string> }>
        refuseError?: string
        inlineRefuseElapsed: number
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
  check('an inline refuse slot reports and prints without waiting for the deadline', facts.inlineRefuseElapsed < 1800, `${facts.inlineRefuseElapsed}ms`)
  check('an invalid authored shrink marker cannot prevent page readiness', true)

  await page.waitForFunction(() => document.querySelector('#card-settings')?.shadowRoot?.querySelector('[part~="fill-select"]'))
  const settings = page.locator('#card-settings')
  // The panel sits below the cards; bring it into view first, as an author would scroll to it.
  await settings.scrollIntoViewIfNeeded()
  const nameInput = settings.locator('[data-key="name"] input')
  check(
    'a source value is read-only with an override control',
    (await nameInput.evaluate((input: HTMLInputElement) => input.readOnly)) === true && (await settings.locator('[data-action="override"]').count()) === 1,
  )
  await settings.locator('[data-action="override"]').click()
  check('overriding a source value makes the field editable', (await nameInput.evaluate((input: HTMLInputElement) => input.readOnly)) === false)
  await nameInput.fill('Hand Name')
  await page.evaluate(() => (window as unknown as { itemSettingsAuthoring: { flush(): Promise<void> } }).itemSettingsAuthoring.flush())
  const saved = await page.evaluate(
    () => (window as unknown as { itemSettingsFacts: { saves: Array<{ values: Record<string, string> }> } }).itemSettingsFacts.saves.at(-1)?.values.name,
  )
  check('editing a value saves through the host handler', saved === 'Hand Name', String(saved))

  await settings.locator('[part~="fill-select"]').selectOption('noah')
  await page.locator('#mina iframe').first().contentFrame().locator('body').getByText('Noah Kim').waitFor()
  const minaAfterSwitch = await frameText('#mina iframe')
  check('switching fills changes the card', minaAfterSwitch.join(' ').includes('Noah Kim'), minaAfterSwitch.join(' '))

  const rtl = await page.locator('#card-settings-rtl').evaluate((element) => {
    const root = element.shadowRoot
    const sections = root?.querySelector('[part~="sections"]')
    return {
      dir: sections?.getAttribute('dir'),
      textAlign: sections ? getComputedStyle(sections).textAlign : null,
      inputDir: root?.querySelector<HTMLInputElement>('[data-key="name"] input')?.dir,
    }
  })
  check(
    'item settings lays out in rtl and value inputs use dir auto',
    rtl.dir === 'rtl' && rtl.textAlign === 'start' && rtl.inputDir === 'auto',
    JSON.stringify(rtl),
  )
}
