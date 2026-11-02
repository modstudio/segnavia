import type { Harness } from './harness.ts'

type EditorEvents = {
  markdown: string[]
  title: string[]
  modes: string[]
  states: unknown[]
  links: Array<string | null>
  original: string
  saves: number
  submits: number
}

export async function verifyMarkdownEditor(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('markdown-editor.html'))
  const editor = page.locator('segnavia-markdown-editor')
  const rich = editor.locator('.ProseMirror')
  await rich.waitFor()

  const initial = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as { markdown: string; mode: string; run(command: string, args?: unknown): boolean }
    const events = (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents
    const before = events.markdown.length
    element.run('toggle-mode')
    return { markdown: element.markdown, mode: element.mode, changes: events.markdown.length - before, original: events.original }
  })
  check(
    'rich to source without edits is byte-for-byte silent',
    initial.markdown === initial.original && initial.mode === 'source' && initial.changes === 0,
    JSON.stringify(initial),
  )

  const source = editor.locator('.cm-content')
  await source.waitFor()
  const sourceDirections = await editor.locator('.cm-line').evaluateAll((lines) => lines.map((line) => getComputedStyle(line).direction))
  check(
    'English and Hebrew source lines each take their own direction',
    sourceDirections.includes('ltr') && sourceDirections.includes('rtl'),
    sourceDirections.join(','),
  )

  await page.evaluate(() => (document.getElementById('editor') as unknown as { run(command: string): boolean }).run('toggle-mode'))
  await rich.waitFor()
  const richDirections = await rich.locator('p').evaluateAll((lines) => lines.map((line) => getComputedStyle(line).direction))
  check(
    'English and Hebrew rich blocks each take their own direction',
    richDirections.includes('ltr') && richDirections.includes('rtl'),
    richDirections.join(','),
  )

  const locked = editor.locator('[part~="locked-block"]')
  const nested = locked.locator('segnavia-page iframe').first()
  await nested.waitFor()
  const sandbox = await nested.getAttribute('sandbox')
  check('locked content uses a nested page without same-origin authority', Boolean(sandbox) && !sandbox?.includes('allow-same-origin'), String(sandbox))

  const beforeEdit = await page.evaluate(() => (document.getElementById('editor') as unknown as { markdown: string }).markdown)
  const english = rich.locator('p').filter({ hasText: 'English line.' })
  await english.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Added')
  const afterEdit = await page.evaluate(() => (document.getElementById('editor') as unknown as { markdown: string }).markdown)
  check(
    'typing in rich mode changes the paragraph and retains locked source',
    afterEdit.includes('English line. Added') && afterEdit.includes('```mermaid\nflowchart LR') && afterEdit.includes('<!-- carried comment -->'),
    afterEdit,
  )
  check('one rich edit leaves the rest of the fixture present', afterEdit.length > beforeEdit.length, `${beforeEdit.length} -> ${afterEdit.length}`)

  await rich.locator('p').filter({ hasText: 'English line. Added' }).click()
  await page.keyboard.press('ControlOrMeta+k')
  const linkRequests = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.links)
  check('Mod-K emits a link request', linkRequests.at(-1) === null, JSON.stringify(linkRequests))
  const linkResult = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as { run(command: string, args?: unknown): boolean }
    let refused = ''
    try {
      element.run('link', { href: 'javascript:alert(1)' })
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error)
    }
    return { refused, allowed: element.run('link', { href: 'https://example.com/allowed' }) }
  })
  check(
    'link commands refuse unsafe URLs and accept reader-safe ones',
    linkResult.refused.includes('javascript:alert(1)') && linkResult.allowed,
    JSON.stringify(linkResult),
  )

  const lockedAtom = locked.first()
  await lockedAtom.click()
  await page.keyboard.press('Enter')
  const lockedSource = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as { mode: string }
    const selection = document.querySelector('segnavia-markdown-editor')?.shadowRoot?.querySelector('.cm-content')?.ownerDocument.getSelection()
    return { mode: element.mode, offset: selection?.anchorOffset }
  })
  check('Enter on a selected locked block switches to source', lockedSource.mode === 'source', JSON.stringify(lockedSource))

  const title = editor.locator('input[part~="title"]')
  await title.click()
  await page.keyboard.press('Alt+Meta+m')
  const titleMode = await page.evaluate(() => (document.getElementById('editor') as unknown as { mode: string }).mode)
  check('Mod-Alt-M from the title field toggles mode', titleMode === 'rich', titleMode)
  await title.fill('Changed title')
  const titleMarkdown = await page.evaluate(() => (document.getElementById('editor') as unknown as { markdown: string }).markdown)
  check('editing a leading-heading title changes markdown first line', titleMarkdown.startsWith('# Changed title\n'), titleMarkdown)

  const noHeading = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as { markdown: string; title: string | null }
    element.markdown = 'Body without heading'
    return element.title
  })
  check('leading-heading mode keeps its title outside rich content', noHeading === '' && (await rich.locator('h1').count()) === 0, String(noHeading))

  const savesBefore = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.saves)
  await rich.click()
  await page.keyboard.press('ControlOrMeta+s')
  const savesAfter = await page.evaluate(() => (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.saves)
  check('Mod-S in rich mode emits save', savesAfter === savesBefore + 1, `${savesBefore} -> ${savesAfter}`)
}
