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

export const LETTER_IMPOSITION = { paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } }

export interface LegacyPrintedPage {
  [key: string]: unknown
  html: string
  lang?: string
  dir?: string
  scripts?: string
  printedPages?: {
    parents?: Array<{ name: string; margin: unknown }>
    parentRules?: unknown
    fragmentation?: unknown
  }
}

export function printedDocument(page: LegacyPrintedPage) {
  const { html, lang, dir, scripts, printedPages, ...fields } = page
  return {
    type: 'document',
    kind: 'printed',
    ...fields,
    settings: { lang, dir, scripts },
    parentPages: (printedPages?.parents ?? []).map(({ margin, ...parent }) => ({ type: 'parentPage', ...parent, geometry: { margin } })),
    parentRules: printedPages?.parentRules,
    fragmentation: printedPages?.fragmentation,
    children: [{ type: 'page', body: { html } }],
  }
}

export async function printPagesInBrowser(input: {
  imposition: unknown
  motifs?: Array<{ key: string }>
  output: 'count' | 'html'
  printedPage: unknown
}): Promise<number | string> {
  const bundle = '/segnavia.js'
  const { printPages } = (await import(bundle)) as {
    printPages: (pages: unknown[], imposition: unknown, options: unknown) => Promise<void>
  }
  let output: number | string = input.output === 'count' ? 0 : ''
  const source = input.motifs ? { motif: async (key: string) => input.motifs?.find((motif) => motif.key === key) } : undefined
  await printPages([input.printedPage], input.imposition, {
    motifs: source ? { source } : undefined,
    print: (win: Window) => {
      output = input.output === 'count' ? win.document.querySelectorAll('.paper').length : `<!doctype html>${win.document.documentElement.outerHTML}`
    },
  })
  return output
}

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
  url: string,
  check: Harness['check'],
  parentPages: LegacyPrintedPage['printedPages'],
): Promise<void> {
  const printedComposition: Array<{ language: string; report: ComposedLineWidthReport }> = []
  for (const language of ['en', 'he'] as const) {
    const fixture: PrintedCompositionFixture = {
      html: `<div class="segnavia-chapter">${readFileSync(path.join(ROOT, `fixtures/fidelity/control-book-${language}.html`), 'utf8')}</div>`,
      lang: language,
      dir: language === 'he' ? 'rtl' : undefined,
    }
    await page.goto(url)
    const html = await page.evaluate(printPagesInBrowser, {
      imposition: LETTER_IMPOSITION,
      output: 'html' as const,
      printedPage: printedDocument({ ...fixture, print: { paper: 'letter' }, printedPages: parentPages }),
    })
    await page.setContent(html as string, { waitUntil: 'load' })
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
