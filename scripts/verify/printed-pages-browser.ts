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

export async function verifyPrintedParentPages(page: Page, url: string, check: Harness['check']) {
  page.on('console', (message) => {
    if (message.text().includes('SEGNA-167 probe')) console.log(message.text())
  })
  const work = mkdtempSync(path.join(tmpdir(), 'segnavia-browser-pages-'))
  try {
    await page.goto(url)
    const fixtures = (await page.evaluate(() => fetch('/parent-pages-print.json').then((response) => response.json()))) as {
      cases: Array<{ name: string; page: unknown }>
      motifs: Array<{ key: string }>
    }
    for (const fixture of fixtures.cases) {
      await page.goto(url)
      const html = await page
        .evaluate(
          async ({ motifs, printedPage }) => {
            const bundle = '/segnavia.js'
            const { printPages } = (await import(bundle)) as { printPages: (pages: unknown[], imposition: unknown, options: unknown) => Promise<void> }
            let output = ''
            const source = {
              motif: async (key: string) => motifs.find((motif) => motif.key === key),
            }
            await printPages(
              [printedPage],
              { paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } },
              { motifs: { source }, print: (win: Window) => (output = `<!doctype html>${win.document.documentElement.outerHTML}`) },
            )
            return output
          },
          { motifs: fixtures.motifs, printedPage: fixture.page },
        )
        .catch((error) => {
          throw new Error(`Browser printing the ${fixture.name} parent-page fixture failed: ${String(error)}`)
        })
      await page.setContent(html, { waitUntil: 'load' })
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
