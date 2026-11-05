import type { Locator, Page } from 'playwright-core'
import { BOUNDED_WAIT_MS } from './harness.ts'

const directions = (editor: Locator) => editor.locator('.cm-line').evaluateAll((lines) => lines.map((line) => getComputedStyle(line).direction))

export async function sourceDirectionsAtDocumentEnds(page: Page, editor: Locator, markdown: string) {
  const sourceDirections = await directions(editor)
  const lastSourceLine = markdown
    .split('\n')
    .reverse()
    .find((line) => line.trim().length > 0)
  await editor.locator('.cm-scroller').evaluate((scroller) => {
    scroller.scrollTop = scroller.scrollHeight
  })
  const sourceEndRendered = await page
    .waitForFunction(
      (lastLine) =>
        Array.from(document.getElementById('editor')?.shadowRoot?.querySelectorAll('.cm-line') ?? [])
          .reverse()
          .find((line) => line.textContent?.trim().length)?.textContent === lastLine,
      lastSourceLine,
      { timeout: BOUNDED_WAIT_MS },
    )
    .then(() => true)
    .catch(() => false)
  return { sourceDirections, sourceEndDirections: sourceEndRendered ? await directions(editor) : [], sourceEndRendered }
}
