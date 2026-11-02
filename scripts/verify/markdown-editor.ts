import type { Harness } from './harness.ts'

type EditorEvents = { markdown: string[]; title: string[]; saves: number }

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
  check('typing in the source editor emits changed markdown', typed.endsWith('שורה בעברית. Added'), typed)

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
  await page.keyboard.press('Enter')
  const titleValue = await title.inputValue()
  check('Enter in the title field adds no newline', !titleValue.includes('\n') && !titleValue.includes('\r'), JSON.stringify(titleValue))

  await title.fill('Changed title')
  const titleMarkdown = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.markdown.at(-1) ?? '')
  check('editing a leading-heading title changes emitted markdown first line', titleMarkdown.startsWith('# Changed title\n'), titleMarkdown)
}
