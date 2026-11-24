import type { SegnaviaHtmlEditor } from '@segnavia/html-editor'
import type { Harness } from './harness.ts'

type EditorHandle = Pick<SegnaviaHtmlEditor, 'html' | 'run'>

export async function verifyHtmlEditor(h: Harness): Promise<void> {
  const { page, check } = h
  await page.goto(h.url('html-editor.html'))
  const rich = page.locator('segnavia-html-editor').locator('.ProseMirror')
  await rich.waitFor()

  await rich.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' friend')
  await page.keyboard.press('ControlOrMeta+a')
  await page.evaluate(() => (document.getElementById('editor') as unknown as EditorHandle).run('bold'))

  const result = await page.evaluate(() => {
    const editor = document.getElementById('editor') as unknown as EditorHandle & HTMLElement
    const atom = editor.shadowRoot?.querySelector<HTMLElement>('[data-html-atom]')
    return {
      html: editor.html,
      atomCount: editor.shadowRoot?.querySelectorAll('[data-html-atom]').length ?? 0,
      atomName: atom?.getAttribute('data-html-atom'),
      atomEditable: atom?.contentEditable,
    }
  })
  check('HTML editor types and returns bold profile HTML', result.html === '<p><strong>Welcome {{first_name}}&nbsp;friend</strong></p>', result.html)
  check(
    'HTML editor keeps one atom whole',
    result.atomCount === 1 && result.atomName === 'first_name' && result.atomEditable === 'false',
    JSON.stringify(result),
  )
}
