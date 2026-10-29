import type { Harness } from './harness.ts'

interface SelectionPage extends HTMLElement {
  page: unknown
  slots: unknown
  readSelection(): Promise<{ text: string; pageText: string }>
  showUrl(url: string): void
}

interface SelectionStage extends HTMLElement {
  readSelection(): Promise<{ text: string; pageText: string }>
}

export async function verifySelection(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('page.html'))
  await page.evaluate(() => {
    const mount = (id: string) => {
      const element = document.createElement('segnavia-page') as SelectionPage
      element.id = id
      document.body.append(element)
      return element
    }
    const immediate = mount('selection-immediate')
    immediate.page = { html: '<p>Immediate page text</p>', scripts: 'refuse' }
    ;(window as typeof window & { immediateSelection: Promise<{ text: string; pageText: string }> }).immediateSelection = immediate.readSelection()
    mount('selection-empty').page = { html: '<p>Plain page text</p>', scripts: 'refuse' }
    mount('selection-rtl').page = {
      html: '<p id="hebrew">בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ׃</p>',
      scripts: 'refuse',
      dir: 'rtl',
      lang: 'he',
    }
    mount('selection-sandboxed').page = { html: '<p>Script-enabled</p>', scripts: 'sandboxed' }
    mount('selection-url').showUrl('ticket-page.html')
    const replacement = mount('selection-replacement')
    let releaseAsset!: (value: string) => void
    replacement.slots = {
      fill: { id: 'filled', values: { image: { asset: 'held' }, text: 'Filled document text' } },
      resolveAsset: () =>
        new Promise<string>((resolve) => {
          releaseAsset = resolve
        }),
    }
    replacement.page = {
      html: '<p data-slot-value="text">Unfilled document text</p><img data-slot-src="image">',
      scripts: 'refuse',
      slots: [
        { key: 'text', label: 'Text', type: 'text' },
        { key: 'image', label: 'Image', type: 'image' },
      ],
    }
    Object.assign(window as typeof window & Record<string, unknown>, {
      releaseSelectionAsset: () => releaseAsset('data:image/gif;base64,R0lGODlhAQABAAAAACw='),
    })
  })

  const immediate = await page.evaluate(
    () => (window as typeof window & { immediateSelection: Promise<{ text: string; pageText: string }> }).immediateSelection,
  )
  check(
    'a selection read made before bridge readiness waits for the ready message',
    immediate.pageText.includes('Immediate page text'),
    JSON.stringify(immediate),
  )

  const replacement = page.locator('#selection-replacement')
  const unfilled = await replacement.evaluate((element: SelectionPage) => element.readSelection())
  check('the held slot page first reports its unfilled document', unfilled.pageText.includes('Unfilled document text'), JSON.stringify(unfilled))
  await page.evaluate(() => (window as typeof window & { releaseSelectionAsset(): void }).releaseSelectionAsset())
  await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>('#selection-replacement iframe')?.srcdoc.includes('data:image/gif;base64'))
  const filled = await replacement.evaluate((element: SelectionPage) => element.readSelection())
  check('a selection read after a held slot fill uses the replacing document', filled.pageText.includes('Filled document text'), JSON.stringify(filled))

  const emptyFrame = await (await page.locator('#selection-empty iframe').elementHandle())?.contentFrame()
  if (!emptyFrame) throw new Error('The empty-selection page did not mount its frame.')
  await emptyFrame.locator('p').waitFor()
  const emptyPageText = await emptyFrame.evaluate(() => document.body.innerText)
  const empty = await page.locator('#selection-empty').evaluate((element: SelectionPage) => element.readSelection())
  check('an empty selection returns the page innerText', empty.text === '' && empty.pageText === emptyPageText, JSON.stringify(empty))

  const phrase = 'בְּרֵאשִׁית בָּרָא'
  const rtlFrame = await (await page.locator('#selection-rtl iframe').elementHandle())?.contentFrame()
  if (!rtlFrame) throw new Error('The Hebrew-selection page did not mount its frame.')
  await rtlFrame.locator('#hebrew').waitFor()
  await rtlFrame.evaluate((selected) => {
    const text = document.querySelector('#hebrew')?.firstChild
    if (!text?.textContent) throw new Error('The Hebrew phrase is missing.')
    const start = text.textContent.indexOf(selected)
    if (start < 0) throw new Error('The Hebrew phrase cannot be selected.')
    const range = document.createRange()
    range.setStart(text, start)
    range.setEnd(text, start + selected.length)
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, phrase)
  const rtl = await page.locator('#selection-rtl').evaluate((element: SelectionPage) => element.readSelection())
  check('a pointed Hebrew selection keeps its exact text and marks', rtl.text === phrase && rtl.pageText.includes(phrase), JSON.stringify(rtl))

  const sandboxedRefusal = await page.locator('#selection-sandboxed').evaluate(async (element: SelectionPage) => {
    try {
      await element.readSelection()
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })
  check(
    'a script-enabled page refuses selection reads by name',
    sandboxedRefusal.includes('author scripts run') && sandboxedRefusal.includes('could forge the reply'),
    sandboxedRefusal,
  )

  const urlRefusal = await page.locator('#selection-url').evaluate(async (element: SelectionPage) => {
    try {
      await element.readSelection()
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })
  check('a host-served page refuses selection reads by name', urlRefusal.includes('host-served document') && urlRefusal.includes('showUrl'), urlRefusal)

  const stageSelection = await page.evaluate(async () => {
    const stage = document.createElement('segnavia-stage') as SelectionStage
    const deck = {
      title: 'Selection',
      scripts: 'refuse',
      slides: [{ id: 'selection', content: { kind: 'html', html: '<p>Shown slide text</p>' } }],
    }
    stage.setAttribute('hash', 'off')
    stage.setAttribute('src', URL.createObjectURL(new Blob([JSON.stringify(deck)], { type: 'application/json' })))
    document.body.append(stage)
    while (!stage.querySelector('iframe')) await new Promise(requestAnimationFrame)
    return stage.readSelection()
  })
  check('a stage reads the selection from its shown refused-script slide', stageSelection.pageText.includes('Shown slide text'), JSON.stringify(stageSelection))
}
