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
const bodyWord = (word: string) => /^(?:English|Mixed|עברית)-\d+$/.test(word) || /^WIDOW-\d$/.test(word) || word === 'English'
const closeWord = (left: PdfWord, right: PdfWord) => left.text === right.text && Math.abs(left.x - right.x) <= 0.5 && Math.abs(left.y - right.y) <= 0.5

export async function verifyPrintedParentPages(page: Page, url: string, check: Harness['check']) {
  const work = mkdtempSync(path.join(tmpdir(), 'segnavia-browser-pages-'))
  try {
    await page.goto(url)
    const fixtures = (await page.evaluate(() => fetch('/parent-pages-print.json').then((response) => response.json()))) as unknown[]
    const names = ['english', 'hebrew', 'mixed']
    for (const [index, fixture] of fixtures.entries()) {
      const html = await page.evaluate(async (printedPage) => {
        const bundle = '/segnavia.js'
        const { printPages } = (await import(bundle)) as { printPages: (pages: unknown[], imposition: unknown, options: unknown) => Promise<void> }
        let output = ''
        const source = {
          motif: async (key: string) => {
            if (key === 'printed-head') {
              return {
                key,
                revision: 'demo',
                label: 'Printed head',
                fields: [],
                fonts: [],
                versions: [
                  { lang: 'en', html: '<bdi>LETTERHEAD</bdi>' },
                  { lang: 'he', html: '<bdi>כותרת</bdi>' },
                ],
              }
            }
            if (key === 'printed-foot') {
              return {
                key,
                revision: 'demo',
                label: 'Printed foot',
                fields: [],
                fonts: [],
                versions: [
                  {
                    lang: 'en',
                    html: '<bdi>Page <span data-slot-value="printedPage.number"></span> of <span data-slot-value="printedPage.total"></span></bdi>',
                  },
                  {
                    lang: 'he',
                    html: '<bdi>עמוד <span data-slot-value="printedPage.number"></span> מתוך <span data-slot-value="printedPage.total"></span></bdi>',
                  },
                ],
              }
            }
          },
        }
        await printPages(
          [printedPage],
          { paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } },
          { motifs: { source }, print: (win: Window) => (output = `<!doctype html>${win.document.documentElement.outerHTML}`) },
        )
        return output
      }, fixture)
      await page.setContent(html, { waitUntil: 'load' })
      await page.waitForTimeout(50)
      await Promise.all(
        page
          .frames()
          .slice(1)
          .map((frame) => frame.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))),
      )
      const browserFile = path.join(work, `${names[index]}.pdf`)
      writeFileSync(browserFile, await page.pdf({ printBackground: true, preferCSSPageSize: true }))
      const serverFile = path.join(ROOT, 'out', `pages-parent-${names[index]}.pdf`)
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
          const actual = words.find((word) => bodyWord(word.text))
          const expected = (server[pageIndex] ?? []).find((word) => bodyWord(word.text))
          return Boolean(actual && expected && closeWord(actual, expected))
        })
      check(
        `browser and server ${names[index]} parent-page letters have matching papers, furniture and first body lines`,
        browser.length === server.length && furnitureMatches && bodyMatches,
        `browser=${browser.length} server=${server.length} furniture=${furnitureMatches} body=${bodyMatches}`,
      )
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
