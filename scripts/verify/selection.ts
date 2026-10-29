import type { Harness } from './harness.ts'

interface SelectionPage extends HTMLElement {
  page: unknown
  readSelection(): Promise<{ text: string; pageText: string }>
  showUrl(url: string): void
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
  })

  const immediate = await page.evaluate(
    () => (window as typeof window & { immediateSelection: Promise<{ text: string; pageText: string }> }).immediateSelection,
  )
  check(
    'a selection read made before bridge readiness waits for the ready message',
    immediate.pageText.includes('Immediate page text'),
    JSON.stringify(immediate),
  )

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
}
