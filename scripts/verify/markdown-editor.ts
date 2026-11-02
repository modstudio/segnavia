import type { Harness } from './harness.ts'

type EditorEvents = { markdown: string[]; title: string[]; saves: number; submits: number }

export async function verifyMarkdownEditor(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('markdown-editor.html'))
  const editor = page.locator('segnavia-markdown-editor')
  const content = editor.locator('.cm-content')
  await content.waitFor()

  await content.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Added')
  const typed = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.markdown.at(-1) ?? '')
  check('typing in the source editor emits changed markdown', typed.includes(' Added'), typed)

  const directions = await editor.locator('.cm-line').evaluateAll((lines) => lines.map((line) => getComputedStyle(line).direction))
  check('English and Hebrew source lines each take their own direction', directions.includes('ltr') && directions.includes('rtl'), directions.join(','))

  const savesBefore = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.saves)
  await content.click()
  await page.keyboard.press('ControlOrMeta+s')
  const savesAfter = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.saves)
  check('Mod-S in the source editor emits save', savesAfter === savesBefore + 1, `${savesBefore} -> ${savesAfter}`)

  const title = editor.locator('input[part~="title"]')
  await title.click()
  await page.keyboard.press('End')
  const submitsBefore = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.submits)
  await page.keyboard.press('Enter')
  const submitsAfter = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.submits)
  check('Enter in the title field does not submit its form', submitsAfter === submitsBefore, `${submitsBefore} -> ${submitsAfter}`)

  await title.fill('Changed title')
  const titleMarkdown = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.markdown.at(-1) ?? '')
  check('editing a leading-heading title changes emitted markdown first line', titleMarkdown.startsWith('# Changed title\n'), titleMarkdown)

  const titleWithoutHeading = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as { markdown: string; title: string | null }
    element.markdown = 'Body without heading'
    return element.title
  })
  check(
    'leading-heading mode shows an empty title for a body without a heading',
    titleWithoutHeading === '' && (await title.isVisible()),
    String(titleWithoutHeading),
  )
  await title.fill('Added title')
  const addedTitleMarkdown = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.markdown.at(-1) ?? '')
  check('typing a title for a body without one emits a leading heading', addedTitleMarkdown.startsWith('# Added title\n\n'), addedTitleMarkdown)

  const afterUndo = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as { markdown: string; run(command: string): void }
    element.markdown = 'First host body'
    element.markdown = 'Second host body'
    element.run('undo')
    return element.markdown
  })
  check('undo after a host markdown write leaves the host text', afterUndo === 'Second host body', afterUndo)

  const titleBoundary = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as {
      title: string | null
      titleSource: 'separate' | 'leading-heading'
      hasAttribute(name: string): boolean
      setAttribute(name: string, value: string): void
    }
    element.titleSource = 'separate'
    element.title = null
    const propertyWroteAttribute = element.hasAttribute('title')
    element.setAttribute('title', 'native tooltip')
    return { propertyWroteAttribute, propertyAfterAttribute: element.title }
  })
  check(
    'the nullable editor title neither writes nor reads the native title attribute',
    !titleBoundary.propertyWroteAttribute && titleBoundary.propertyAfterAttribute === null && !(await title.isVisible()),
    JSON.stringify(titleBoundary),
  )
}
