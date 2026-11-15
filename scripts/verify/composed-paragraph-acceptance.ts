import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright-core'
import {
  type ComposedLineWidthReport,
  type ComposedParagraphLines,
  composedLineWidthReport,
  composedNoteParagraphReport,
  composedParagraphLines,
} from './composed-paragraphs.ts'
import { type Harness, ROOT } from './harness.ts'

export async function verifyComposedBookParagraphs(h: Harness): Promise<void> {
  await h.page.goto(h.url('book-composition.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `composition-book-${language}`
    const frame = h.page.frameLocator(`#${id} iframe[data-segnavia-book-layout="pages"]`)
    await frame.locator('html[data-segnavia-composed]').waitFor({ timeout: 20_000, state: 'attached' })
    const widths = await frame.locator('html').evaluate(composedLineWidthReport)
    h.check(
      `${id} composed non-final line content fills the paragraph measure within 0.5px`,
      widths.paragraphs > 0 && widths.maxLines >= 3 && widths.checked > 0 && widths.failures.length === 0,
      JSON.stringify(widths),
    )
    const screen = await frame.locator('html').evaluate(composedParagraphLines)
    const printed = await h.page.evaluate(
      (url) => fetch(url).then((response) => response.json() as Promise<ComposedParagraphLines[]>),
      h.url(`control-book-${language}-composition-lines.json`),
    )
    h.check(
      `${id} screen and renderer print documents use identical composed paragraph breaks`,
      screen.length > 0 && JSON.stringify(screen) === JSON.stringify(printed),
      `screen=${JSON.stringify(screen)} print=${JSON.stringify(printed)}`,
    )
    const notes = await frame.locator('html').evaluate(composedNoteParagraphReport)
    h.check(
      `${id} converged note paragraphs and their window pieces keep the composed line count and one reference`,
      notes.paragraphs > 0 && notes.matches,
      notes.detail,
    )
  }
}

interface PrintedCompositionFixture {
  html: string
  lang: 'en' | 'he'
  dir?: 'rtl'
}

export async function verifyPrintedComposedParagraphs(
  page: Page,
  check: Harness['check'],
  render: (fixture: PrintedCompositionFixture) => Promise<string>,
): Promise<void> {
  const printedComposition: Array<{ language: string; report: ComposedLineWidthReport }> = []
  for (const language of ['en', 'he'] as const) {
    const html = await render({
      html: readFileSync(path.join(ROOT, `fixtures/fidelity/control-book-${language}.html`), 'utf8'),
      lang: language,
      dir: language === 'he' ? 'rtl' : undefined,
    })
    await page.setContent(html, { waitUntil: 'load' })
    const frames = page.frames().slice(1)
    await Promise.all(frames.map((frame) => frame.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))))
    const reports = await Promise.all(frames.map((frame) => frame.evaluate(composedLineWidthReport)))
    printedComposition.push({
      language,
      report: {
        paragraphs: reports.reduce((sum, report) => sum + report.paragraphs, 0),
        maxLines: Math.max(0, ...reports.map((report) => report.maxLines)),
        checked: reports.reduce((sum, report) => sum + report.checked, 0),
        failures: reports.flatMap((report) => report.failures),
      },
    })
  }
  check(
    'English and Hebrew printed pages compose non-final line content to the measure within 0.5px',
    printedComposition.every(({ report }) => report.paragraphs > 0 && report.maxLines >= 3 && report.checked > 0 && report.failures.length === 0),
    JSON.stringify(printedComposition),
  )
}
