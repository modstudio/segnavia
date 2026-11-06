import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Page } from 'playwright-core'
import { type Harness, ROOT } from './harness.ts'

interface PdfWord {
  text: string
  x: number
  y: number
}

function pdfWords(file: string): PdfWord[][] {
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  return [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((page) =>
    [...(page[1] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]+)<\/word>/g)].map((word) => ({
      text: word[3] ?? '',
      x: Number(word[1]),
      y: Number(word[2]),
    })),
  )
}

const furnitureWord = (word: string) => ['LETTERHEAD', 'Page', 'of', 'כותרת', 'עמוד', 'מתוך', 'א', 'ב', 'ג'].includes(word)
const closeWord = (left: PdfWord, right: PdfWord) => left.text === right.text && Math.abs(left.x - right.x) <= 0.5 && Math.abs(left.y - right.y) <= 0.5
const LETTER_IMPOSITION = { paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } }

async function printPagesInBrowser(input: {
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

export async function verifyPrintedParentPages(page: Page, url: string, check: Harness['check']) {
  const work = mkdtempSync(path.join(tmpdir(), 'segnavia-browser-pages-'))
  try {
    await page.goto(url)
    const countPrintedPapers = (printedPage: unknown) =>
      page.evaluate(printPagesInBrowser, { imposition: LETTER_IMPOSITION, output: 'count' as const, printedPage }) as Promise<number>
    const parentPages = {
      parents: [{ name: 'body', margin: { top: 15, bottom: 15, inner: 15, outer: 15 } }],
      rules: { every: 'body' },
    }
    for (const fixture of [
      { name: 'LTR', page: { html: '<div>Short block</div>', lang: 'en', print: { paper: 'letter' }, printedPages: parentPages } },
      {
        name: 'Hebrew RTL',
        page: { html: '<div>קטע קצר</div>', lang: 'he', dir: 'rtl', print: { paper: 'letter' }, printedPages: parentPages },
      },
    ]) {
      const papers = await countPrintedPapers(fixture.page)
      check(`a short ${fixture.name} block prints exactly one paper`, papers === 1, `papers=${papers}`)
    }
    const exactPapers = await countPrintedPapers({
      html: '<div style="block-size:249.4mm"></div><div style="block-size:249.4mm"></div><div style="block-size:249.4mm"></div>',
      lang: 'en',
      print: { paper: 'letter' },
      printedPages: parentPages,
    })
    check('content that exactly fills three columns prints exactly three papers', exactPapers === 3, `papers=${exactPapers}`)
    const refusal = await page.evaluate(async () => {
      const bundle = '/segnavia.js'
      const { printPages } = (await import(bundle)) as {
        printPages: (pages: unknown[], imposition: unknown, options: unknown) => Promise<void>
      }
      const printedPage = {
        html: Array.from({ length: 501 }, () => '<div style="block-size:249.4mm"></div>').join(''),
        lang: 'en',
        print: { paper: 'letter' },
        printedPages: {
          parents: [{ name: 'body', margin: { top: 15, bottom: 15, inner: 15, outer: 15 } }],
          rules: { every: 'body' },
        },
      }
      return new Promise<string | null>((resolve) => {
        const timer = window.setTimeout(() => finish(null), 10_000)
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type === 'segnavia:compose-failure') finish(event.data.text)
        }
        const finish = (result: string | null) => {
          window.clearTimeout(timer)
          window.removeEventListener('message', onMessage)
          resolve(result)
        }
        window.addEventListener('message', onMessage)
        void printPages(
          [printedPage],
          { paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } },
          { deadlineMs: 9_000 },
        ).catch(() => {})
      })
    })
    check(
      'a printed-pages preview reports content above the page limit as a composition refusal',
      refusal?.includes('above the limit 500') === true,
      `refusal=${JSON.stringify(refusal)}`,
    )
    for (const fixture of [
      { name: 'LTR', page: { html: '<table style="inline-size:464.75mm"><tr><td>Wide table</td></tr></table>', lang: 'en' } },
      {
        name: 'Hebrew RTL',
        page: { html: '<table style="inline-size:464.75mm"><tr><td>טבלה רחבה</td></tr></table>', lang: 'he', dir: 'rtl' },
      },
    ]) {
      const papers = await countPrintedPapers({ ...fixture.page, print: { paper: 'letter' }, printedPages: parentPages })
      check(`a 2.5-column-wide ${fixture.name} table prints three papers`, papers === 3, `papers=${papers}`)
    }

    const fixtures = (await page.evaluate(() => fetch('/parent-pages-print.json').then((response) => response.json()))) as {
      cases: Array<{ name: string; page: unknown }>
      motifs: Array<{ key: string }>
    }
    for (const fixture of fixtures.cases) {
      await page.goto(url)
      const html = await page
        .evaluate(printPagesInBrowser, {
          imposition: LETTER_IMPOSITION,
          motifs: fixtures.motifs,
          output: 'html' as const,
          printedPage: fixture.page,
        })
        .catch((error) => {
          throw new Error(`Browser printing the ${fixture.name} parent-page fixture failed: ${String(error)}`)
        })
      await page.setContent(html as string, { waitUntil: 'load' })
      await page.waitForTimeout(50)
      await Promise.all(
        page
          .frames()
          .slice(1)
          .map((frame) => frame.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))),
      )
      const browserFile = path.join(work, `${fixture.name}.pdf`)
      writeFileSync(browserFile, await page.pdf({ printBackground: true, preferCSSPageSize: true }))
      const serverFile = path.join(ROOT, 'out', `pages-parent-${fixture.name}.pdf`)
      const browser = pdfWords(browserFile)
      const server = pdfWords(serverFile)
      const furnitureMatches =
        browser.length === server.length &&
        browser.every((words, pageIndex) => {
          const expected = (server[pageIndex] ?? []).filter((word) => furnitureWord(word.text))
          const actual = words.filter((word) => furnitureWord(word.text))
          return actual.length === expected.length && actual.every((word, wordIndex) => closeWord(word, expected[wordIndex] as PdfWord))
        })
      const bodyMatches =
        browser.length === server.length &&
        browser.every((words, pageIndex) => {
          const actual = words.find((word) => !furnitureWord(word.text))
          const expected = (server[pageIndex] ?? []).find((word) => !furnitureWord(word.text))
          return Boolean(actual && expected && closeWord(actual, expected))
        })
      check(
        `browser and server ${fixture.name} parent-page letters have matching papers, furniture and first body lines`,
        browser.length === server.length && furnitureMatches && bodyMatches,
        `browser=${browser.length} server=${server.length} furniture=${furnitureMatches} body=${bodyMatches}`,
      )
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
