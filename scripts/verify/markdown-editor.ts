import type { SegnaviaMarkdownEditor } from '@segnavia/markdown-editor'
import type { Harness } from './harness.ts'
import { selectStableLockedAtom } from './locked-atom.ts'

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

type EditorHandle = Pick<SegnaviaMarkdownEditor, 'markdown' | 'mode' | 'run'>

async function selectRichText(page: Harness['page'], text = 'Keyboard target.') {
  await page.evaluate((wanted) => {
    const element = document.getElementById('editor') as unknown as {
      richView: {
        state: { doc: { descendants(visitor: (node: { isText: boolean; text?: string }, position: number) => boolean | void): void } }
        commands: { setTextSelection(selection: { from: number; to: number }): boolean }
        view: { focus(): void }
      }
    }
    let from = -1
    element.richView.state.doc.descendants((node, position) => {
      const index = node.isText ? (node.text ?? '').indexOf(wanted) : -1
      if (index < 0) return
      from = position + index
      return false
    })
    if (from < 0) throw new Error(`Could not select rich text ${JSON.stringify(wanted)}.`)
    element.richView.commands.setTextSelection({ from, to: from + wanted.length })
    element.richView.view.focus()
  }, text)
}

async function resetRich(page: Harness['page'], markdown = 'Keyboard target.') {
  await page.evaluate((value) => {
    const element = document.getElementById('editor') as unknown as EditorHandle
    element.mode = 'rich'
    element.markdown = ''
    element.markdown = value
  }, markdown)
  await page.locator('segnavia-markdown-editor').locator('.ProseMirror').waitFor()
}

async function latestState(page: Harness['page']): Promise<{ marks: string[]; nodes: string[] }> {
  return page.evaluate(() => {
    const states = (globalThis as unknown as { editorEvents: EditorEvents }).editorEvents.states
    return states.at(-1) as { marks: string[]; nodes: string[] }
  })
}

async function verifyKeyMatrix(h: Harness) {
  const { page, check } = h
  const rich = page.locator('segnavia-markdown-editor').locator('.ProseMirror')
  const marks = [
    ['ControlOrMeta+b', 'bold', '**Keyboard target.**'],
    ['ControlOrMeta+i', 'italic', '*Keyboard target.*'],
    ['ControlOrMeta+e', 'code', '`Keyboard target.`'],
    ['ControlOrMeta+Shift+s', 'strike', '~~Keyboard target.~~'],
  ] as const
  for (const [key, mark, expected] of marks) {
    await resetRich(page)
    await selectRichText(page)
    await page.keyboard.press(key)
    const markdown = await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).markdown)
    check(`${key} applies ${mark}`, markdown.includes(expected), markdown)
  }

  const blocks = [
    ['ControlOrMeta+Shift+8', 'bullet-list'],
    ['ControlOrMeta+Shift+7', 'ordered-list'],
    ['ControlOrMeta+Shift+9', 'task-list'],
    ['ControlOrMeta+Shift+b', 'quote'],
    ['ControlOrMeta+Alt+c', 'code-block'],
  ] as const
  for (const [key, node] of blocks) {
    await resetRich(page)
    await selectRichText(page)
    await page.keyboard.press(key)
    check(`${key} applies ${node}`, (await latestState(page)).nodes.includes(node), JSON.stringify(await latestState(page)))
  }

  for (let level = 1; level <= 6; level++) {
    await resetRich(page)
    await selectRichText(page)
    await page.keyboard.press(`ControlOrMeta+Alt+${level}`)
    check(
      `Mod-Alt-${level} applies heading level ${level}`,
      (await latestState(page)).nodes.includes(`heading-${level}`),
      JSON.stringify(await latestState(page)),
    )
  }
  await page.keyboard.press('ControlOrMeta+Alt+0')
  check('Mod-Alt-0 applies paragraph', (await latestState(page)).nodes.includes('paragraph'), JSON.stringify(await latestState(page)))

  await resetRich(page)
  await selectRichText(page)
  await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).run('link', { href: 'https://example.com/allowed' }))
  await page.keyboard.press('ControlOrMeta+Shift+k')
  check('Mod-Shift-K unlinks', !(await latestState(page)).marks.includes('link'), JSON.stringify(await latestState(page)))

  await resetRich(page)
  await selectRichText(page)
  await page.keyboard.press('ControlOrMeta+Alt+Shift+t')
  check('Mod-Alt-Shift-T inserts a 3 by 3 table with a header', (await rich.locator('tr').count()) === 3 && (await rich.locator('th').count()) === 3)
  await page.keyboard.press('ControlOrMeta+Alt+Shift+r')
  check('Mod-Alt-Shift-R adds a table row', (await rich.locator('tr').count()) === 4)
  await page.keyboard.press('ControlOrMeta+Alt+Shift+Backspace')
  check('Mod-Alt-Shift-Backspace deletes a table row', (await rich.locator('tr').count()) === 3)
  await page.keyboard.press('ControlOrMeta+Alt+Shift+c')
  check('Mod-Alt-Shift-C adds a table column', (await rich.locator('tr').first().locator('th,td').count()) === 4)
  await page.keyboard.press('ControlOrMeta+Alt+Shift+Delete')
  check('Mod-Alt-Shift-Delete deletes a table column', (await rich.locator('tr').first().locator('th,td').count()) === 3)
  await page.keyboard.press('ControlOrMeta+Alt+Shift+x')
  check('Mod-Alt-Shift-X deletes the table', (await rich.locator('table').count()) === 0)

  await resetRich(page)
  await selectRichText(page)
  await page.keyboard.insertText('Changed')
  await page.keyboard.press('ControlOrMeta+z')
  const undone = await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).markdown)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  const redone = await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).markdown)
  check('TipTap Mod-Z and Mod-Shift-Z undo and redo', undone === 'Keyboard target.' && redone.includes('Changed'), JSON.stringify({ undone, redone }))
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
  await editor.locator('.cm-scroller').evaluate((scroller) => {
    scroller.scrollTop = scroller.scrollHeight
  })
  await page.waitForTimeout(50)
  const sourceEndDirections = await editor.locator('.cm-line').evaluateAll((lines) => lines.map((line) => getComputedStyle(line).direction))
  check(
    'English and Hebrew source lines each take their own direction',
    sourceDirections.includes('ltr') && sourceEndDirections.includes('rtl'),
    [...sourceDirections, ...sourceEndDirections].join(','),
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
  const nestedPage = locked.locator('segnavia-page').first()
  const nested = nestedPage.locator('iframe')
  await nested.waitFor()
  const sandbox = await nested.getAttribute('sandbox')
  check('locked content uses a nested page without same-origin authority', Boolean(sandbox) && !sandbox?.includes('allow-same-origin'), String(sandbox))
  const lockedDocuments = await locked.locator('iframe').evaluateAll((frames) => frames.map((frame) => (frame as HTMLIFrameElement).srcdoc))
  check(
    'locked nested pages refuse author scripts',
    lockedDocuments.every((document) => !document.includes('lockedAuthorScript')),
    String(lockedDocuments.length),
  )
  const lockedCss = '.locked-css-probe { margin-left: 17px; }'
  await page.evaluate((css) => {
    ;(document.getElementById('editor') as unknown as { css: string }).css = css
  }, lockedCss)
  await page.waitForFunction(
    (css) => (document.getElementById('editor')?.shadowRoot?.querySelector('segnavia-page') as unknown as { css?: string } | null)?.css === css,
    lockedCss,
  )
  const nestedCss = await nestedPage.evaluate((page) => (page as unknown as { css: string }).css)
  check('a CSS change reaches an existing locked nested page', nestedCss === lockedCss, nestedCss)

  const beforeEdit = await page.evaluate(() => (document.getElementById('editor') as unknown as { markdown: string }).markdown)
  await selectRichText(page, 'English line.')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.insertText(' Added')
  const afterEdit = await page.evaluate(() => (document.getElementById('editor') as unknown as { markdown: string }).markdown)
  check('typing in rich mode changes only that block byte-for-byte', afterEdit === `${beforeEdit.replace('English line.', 'English line. Added')}\n`, afterEdit)
  await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).run('toggle-mode'))
  const sourceAfterRich = await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).markdown)
  await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as {
      sourceView: { state: { doc: { length: number } }; dispatch(spec: unknown): void; focus(): void }
    }
    element.sourceView.dispatch({ selection: { anchor: element.sourceView.state.doc.length - 1 } })
    element.sourceView.focus()
  })
  await page.keyboard.insertText(' Source edit.')
  const sourceEdited = await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).markdown)
  await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).run('toggle-mode'))
  await rich.waitFor()
  check(
    'mode switches keep rich and source edits in both directions',
    sourceAfterRich === afterEdit &&
      sourceEdited === sourceAfterRich.replace('שורה בעברית.', 'שורה בעברית. Source edit.') &&
      (await rich.textContent())?.includes('Source edit.') === true,
    JSON.stringify({ sourceAfterRich, sourceEdited }),
  )

  await selectRichText(page, 'English line. Added')
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

  const lockedAtom = editor.locator('[data-locked-label]')
  const expectedLockedOffset = await page.evaluate(() => {
    const markdown = (document.getElementById('editor') as unknown as EditorHandle).markdown
    return markdown.indexOf('```articles') - '# Original title\n'.length
  })
  const lockedSelection = await selectStableLockedAtom(page, lockedAtom, editor.locator('[data-locked-label].ProseMirror-selectednode'))
  if (!lockedSelection.selected) {
    check('Enter on a selected locked block switches to its first source character', false, lockedSelection.detail)
  } else {
    await page.keyboard.press('Enter')
    const lockedSource = await page.evaluate(() => {
      const element = document.getElementById('editor') as unknown as EditorHandle & {
        sourceView: { state: { selection: { main: { head: number } } } }
      }
      return { mode: element.mode, offset: element.sourceView.state.selection.main.head }
    })
    check(
      'Enter on a selected locked block switches to its first source character',
      lockedSource.mode === 'source' && lockedSource.offset === expectedLockedOffset,
      JSON.stringify({ ...lockedSource, expectedLockedOffset }),
    )
  }

  const title = editor.locator('input[part~="title"]')
  const modeBeforeTitleKey = await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).mode)
  await title.click()
  await page.keyboard.press('Alt+Meta+m')
  const titleMode = await page.evaluate(() => (document.getElementById('editor') as unknown as { mode: string }).mode)
  check('Mod-Alt-M from the title field toggles mode', titleMode !== modeBeforeTitleKey, `${modeBeforeTitleKey} -> ${titleMode}`)
  await page.evaluate(() => {
    ;(document.getElementById('editor') as unknown as EditorHandle).mode = 'rich'
  })
  await rich.waitFor()
  await title.fill('Changed title')
  await selectRichText(page, 'English line. Added')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.insertText(' Again')
  const titleMarkdown = await page.evaluate(() => (document.getElementById('editor') as unknown as { markdown: string }).markdown)
  check('editing a leading-heading title changes markdown first line', titleMarkdown.startsWith('# Changed title\n'), titleMarkdown)
  check(
    'a rich edit after a title change keeps exactly one new heading and no old heading',
    titleMarkdown.match(/^# Changed title$/gm)?.length === 1 && !titleMarkdown.includes('# Original title'),
    titleMarkdown,
  )

  const equalOptionAssignment = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as {
      alertLabels: Record<string, string>
      lockedFences: Record<string, string>
      richView: object
    }
    element.lockedFences = { articles: 'Generated list' }
    element.alertLabels = { note: 'Note' }
    const before = element.richView
    element.lockedFences = { articles: 'Generated list' }
    element.alertLabels = { note: 'Note' }
    return before === element.richView
  })
  check('equal rich option objects keep the mounted editor instance', equalOptionAssignment)

  await resetRich(page, 'Before.\n\n```articles\n```\n\nBetween.\n\n```articles\n```\n')
  const lockedTwins = editor.locator('[data-locked-label]')
  await lockedTwins.nth(1).click({ position: { x: 2, y: 2 } })
  await page.keyboard.press('Enter')
  const secondLocked = await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as EditorHandle & {
      sourceView: { state: { selection: { main: { head: number } } } }
    }
    return { actual: element.sourceView.state.selection.main.head, expected: element.markdown.lastIndexOf('```articles') }
  })
  check('editing the second identical locked block selects its own source', secondLocked.actual === secondLocked.expected, JSON.stringify(secondLocked))
  await page.evaluate(() => {
    ;(document.getElementById('editor') as unknown as EditorHandle).mode = 'rich'
  })
  await rich.waitFor()

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

  await resetRich(page)
  await rich.click()
  await page.evaluate(() => {
    const root = document.querySelector('segnavia-markdown-editor')?.shadowRoot?.querySelector('.ProseMirror')
    const data = new DataTransfer()
    data.setData(
      'text/html',
      '<script>globalThis.pastedScript=true</script><img src="https://example.com/p.png" onerror="globalThis.pastedError=true"><a href="javascript:alert(1)">unsafe link</a><img src="javascript:alert(2)">',
    )
    root?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  })
  const pasted = await rich.evaluate((root) => ({
    script: root.querySelector('script') !== null,
    handler: root.querySelector('[onerror]') !== null,
    link: root.querySelector('a') !== null,
    refusedImage: [...root.querySelectorAll('img')].some((image) => image.src.startsWith('javascript:')),
    ran: Boolean(
      (globalThis as unknown as { pastedScript?: boolean; pastedError?: boolean }).pastedScript ||
        (globalThis as unknown as { pastedError?: boolean }).pastedError,
    ),
  }))
  check('pasted HTML drops scripts, handlers, unsafe links and unsafe images', !Object.values(pasted).some(Boolean), JSON.stringify(pasted))

  await resetRich(page, 'Paste here: ')
  const pasteOrigin = async (origin: string, href: string, label: string) => {
    await page.evaluate(
      ({ allowed, link, text }) => {
        const element = document.getElementById('editor') as unknown as { linkOrigins: string[]; shadowRoot: ShadowRoot | null }
        element.linkOrigins = [allowed]
        const root = element.shadowRoot?.querySelector('.ProseMirror')
        const data = new DataTransfer()
        data.setData('text/html', `<a href="${link}">${text}</a>`)
        root?.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
      },
      { allowed: origin, link: href, text: label },
    )
  }
  await pasteOrigin('https://first.example', 'https://first.example/kept', 'kept')
  await pasteOrigin('https://second.example', 'https://first.example/refused', 'refused')
  const pastedLinks = await rich.locator('a').evaluateAll((links) => links.map((link) => ({ href: link.getAttribute('href'), text: link.textContent })))
  check(
    'paste reads the current linkOrigins after mount',
    pastedLinks.length === 1 && pastedLinks[0]?.href === 'https://first.example/kept' && (await rich.textContent())?.includes('refused') === true,
    JSON.stringify(pastedLinks),
  )
  await page.evaluate(() => {
    ;(document.getElementById('editor') as unknown as { linkOrigins: string[] | undefined }).linkOrigins = undefined
  })

  await verifyKeyMatrix(h)
}
