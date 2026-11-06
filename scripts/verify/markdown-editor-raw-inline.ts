import type { Harness } from './harness.ts'

type Indication = { via: 'pointer' | 'selection' } | null

function latestIndication(page: Harness['page']): Promise<Indication | undefined> {
  return page.evaluate(() => (globalThis as unknown as { editorEvents: { rawInline: Indication[] } }).editorEvents.rawInline.at(-1))
}

export async function verifyMarkdownEditorRawInline(h: Harness) {
  const { page, check } = h
  const editor = page.locator('segnavia-markdown-editor')
  const rawInline = editor.locator('[data-raw-inline]').first()
  const tooltip = page.locator('#raw-inline-tooltip')
  await rawInline.hover()
  const hovered = await latestIndication(page)
  check(
    'hovering a raw-inline atom shows the host tooltip without a native title',
    hovered?.via === 'pointer' && (await tooltip.isVisible()) && (await rawInline.getAttribute('title')) === null,
    JSON.stringify(hovered),
  )
  await page.mouse.move(0, 0)
  await page.evaluate(() => {
    const element = document.getElementById('editor') as unknown as {
      richView: {
        state: { doc: { descendants(visitor: (node: { type: { name: string } }, position: number) => boolean | undefined): void } }
        commands: { setTextSelection(position: number): boolean }
        view: { focus(): void }
      }
    }
    let position = -1
    element.richView.state.doc.descendants((node, offset) => {
      if (node.type.name !== 'rawInline') return
      position = offset
      return false
    })
    if (position < 0) throw new Error('The demo raw-inline atom was not found.')
    element.richView.commands.setTextSelection(position)
    element.richView.view.focus()
  })
  await page.keyboard.press('ArrowRight')
  const selection = await latestIndication(page)
  check('arrowing onto a raw-inline atom shows the host tooltip', selection?.via === 'selection' && (await tooltip.isVisible()), JSON.stringify(selection))
}
