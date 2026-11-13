import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Print, paperViewport } from '@segnavia/format'
import { printedPageDocument } from '@segnavia/frame/printed-page-document'
import type { Page } from 'playwright-core'
import { type Harness, ROOT } from './harness.ts'
import { verifyPrintedPageInlineOverflow } from './printed-page-inline-overflow.ts'

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

interface LegacyPrintedPage {
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

function printedDocument(page: LegacyPrintedPage) {
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
    const countPrintedPapers = (printedPage: LegacyPrintedPage) =>
      page.evaluate(printPagesInBrowser, {
        imposition: LETTER_IMPOSITION,
        output: 'count' as const,
        printedPage: printedDocument(printedPage),
      }) as Promise<number>
    const fragmentationLinePages = async (printedPage: LegacyPrintedPage): Promise<number[][]> => {
      await page.goto(url)
      const html = await page.evaluate(printPagesInBrowser, {
        imposition: LETTER_IMPOSITION,
        output: 'html' as const,
        printedPage: printedDocument(printedPage),
      })
      await page.setContent(html as string, { waitUntil: 'load' })
      const frames = page.frames().slice(1)
      await Promise.all(
        frames.map((frame) => frame.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'), undefined, { polling: 100 })),
      )
      const linePages = [[], [], []] as number[][]
      for (const [pageIndex, frame] of frames.entries()) {
        const visibleLines = await frame.evaluate(() => {
          return [...document.querySelectorAll<HTMLElement>('[data-segnavia-window] [data-fragmentation-line]')].flatMap((line) => {
            const clip = line.closest<HTMLElement>('[data-segnavia-window]')?.getBoundingClientRect()
            if (!clip) return []
            const rect = line.getBoundingClientRect()
            const visibleBlock = Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top)
            const visibleInline = Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left)
            return visibleBlock > 0.5 && visibleInline > 0.5 ? [Number(line.dataset.fragmentationLine) - 1] : []
          })
        })
        for (const lineIndex of visibleLines) if (linePages[lineIndex]) linePages[lineIndex].push(pageIndex + 1)
      }
      return linePages
    }
    const fragmentationMarkerPages = async (printedPage: LegacyPrintedPage): Promise<Record<string, number[]>> => {
      await page.goto(url)
      const html = await page.evaluate(printPagesInBrowser, {
        imposition: LETTER_IMPOSITION,
        output: 'html' as const,
        printedPage: printedDocument(printedPage),
      })
      await page.setContent(html as string, { waitUntil: 'load' })
      const frames = page.frames().slice(1)
      await Promise.all(
        frames.map((frame) => frame.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'), undefined, { polling: 100 })),
      )
      const markerPages: Record<string, number[]> = {}
      for (const [pageIndex, frame] of frames.entries()) {
        const visibleMarkers = await frame.evaluate(() => {
          return [...document.querySelectorAll<HTMLElement>('[data-segnavia-window] [data-fragmentation-marker]')].flatMap((marker) => {
            const clip = marker.closest<HTMLElement>('[data-segnavia-window]')?.getBoundingClientRect()
            if (!clip) return []
            const rect = marker.getBoundingClientRect()
            const visibleBlock = Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top)
            const visibleInline = Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left)
            return visibleBlock > 0.5 && visibleInline > 0.5 ? [marker.dataset.fragmentationMarker as string] : []
          })
        })
        for (const marker of visibleMarkers) {
          const pages = markerPages[marker] ?? []
          pages.push(pageIndex + 1)
          markerPages[marker] = pages
        }
      }
      return markerPages
    }
    const parentPages = {
      parents: [{ name: 'body', margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } }],
      parentRules: [{ parent: 'body' }],
    }
    const viewportFixture = {
      type: 'document' as const,
      kind: 'printed' as const,
      settings: { lang: 'en' },
      print: { paper: 'letter' as const },
      parentPages: parentPages.parents.map(({ margin, ...parent }) => ({ type: 'parentPage' as const, ...parent, geometry: { margin } })),
      parentRules: parentPages.parentRules,
      children: [{ type: 'page' as const, body: { html: '<div style="block-size:249.4mm"></div><div style="block-size:249.4mm"></div>' } }],
    }
    const viewportSource = printedPageDocument(viewportFixture, { nonce: 'viewport-independent-composition' })
    const composeAt = async (viewport: { width: number; height: number }) => {
      await page.setContent('<iframe sandbox="allow-scripts" style="border:0"></iframe>')
      const frameElement = page.locator('iframe')
      await frameElement.evaluate(
        (frame, input) => {
          frame.style.width = `${input.viewport.width}px`
          frame.style.height = `${input.viewport.height}px`
          ;(frame as HTMLIFrameElement).srcdoc = input.source
        },
        { source: viewportSource, viewport },
      )
      const frame = await frameElement.contentFrame()
      await frame.locator('html[data-segnavia-composed]').waitFor({ state: 'attached' })
      return frame.locator('[data-segnavia-printed-page]').count()
    }
    const windowSizedCount = await composeAt({ width: 800, height: 600 })
    const paperSizedCount = await composeAt(paperViewport(Print.parse(viewportFixture.print)))
    check(
      'a printed page composes to the same paper count at 800 by 600 and at its paper viewport',
      windowSizedCount === paperSizedCount,
      `800x600=${windowSizedCount} paper=${paperSizedCount}`,
    )
    await page.goto(url)
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
    const fragmentationHtml =
      '<div style="block-size:235mm"></div><table style="border-collapse:collapse"><tr><td>' +
      [1, 2, 3].map((line) => `<div data-fragmentation-line="${line}" style="block-size:10mm">Line ${line}</div>`).join('') +
      '</td></tr></table>'
    for (const fixture of [
      { name: 'English LTR', lang: 'en' },
      { name: 'Hebrew RTL', lang: 'he', dir: 'rtl' },
    ]) {
      const pages = await fragmentationLinePages({
        html: fragmentationHtml,
        lang: fixture.lang,
        dir: fixture.dir,
        print: { paper: 'letter' },
        printedPages: parentPages,
      })
      check(
        `safe fragmentation keeps a three-line row whole in ${fixture.name}`,
        pages.every((held) => held.length === 1) && new Set(pages.flat()).size === 1,
        `line pages=${JSON.stringify(pages)}`,
      )
    }
    const splitPages = await fragmentationLinePages({
      html: fragmentationHtml,
      lang: 'en',
      print: { paper: 'letter' },
      printedPages: { ...parentPages, fragmentation: 'none' },
    })
    check(
      'fragmentation none lets a three-line row split across pages',
      splitPages.every((held) => held.length === 1) && new Set(splitPages.flat()).size > 1,
      `line pages=${JSON.stringify(splitPages)}`,
    )
    const headingTableHtml =
      '<div style="block-size:239mm"></div><h2 data-fragmentation-marker="heading" style="block-size:8mm;margin:0;font:12px serif">Heading</h2>' +
      '<table style="border-collapse:collapse"><tr><td><span data-fragmentation-marker="row" style="line-height:10mm">First row</span></td></tr></table>'
    for (const fixture of [
      { name: 'English LTR', lang: 'en' },
      { name: 'Hebrew RTL', lang: 'he', dir: 'rtl' },
    ]) {
      const pages = await fragmentationMarkerPages({
        html: headingTableHtml,
        lang: fixture.lang,
        dir: fixture.dir,
        print: { paper: 'letter' },
        printedPages: parentPages,
      })
      check(
        `safe fragmentation keeps a heading with its table in ${fixture.name}`,
        pages.heading?.length === 1 && pages.row?.length === 1 && pages.heading[0] === pages.row[0],
        `marker pages=${JSON.stringify(pages)}`,
      )
    }
    const strandedHeadingPages = await fragmentationMarkerPages({
      html: headingTableHtml,
      lang: 'en',
      print: { paper: 'letter' },
      printedPages: { ...parentPages, fragmentation: 'none' },
    })
    check(
      'fragmentation none leaves a heading at the bottom of the earlier paper',
      strandedHeadingPages.heading?.length === 1 &&
        strandedHeadingPages.row?.length === 1 &&
        (strandedHeadingPages.heading[0] as number) < (strandedHeadingPages.row[0] as number),
      `marker pages=${JSON.stringify(strandedHeadingPages)}`,
    )
    const refusal = await page.evaluate(async () => {
      const bundle = '/segnavia.js'
      const { printPages } = (await import(bundle)) as {
        printPages: (pages: unknown[], imposition: unknown, options: unknown) => Promise<void>
      }
      const printedPage = {
        type: 'document',
        kind: 'printed',
        settings: { lang: 'en' },
        print: { paper: 'letter' },
        parentPages: [
          {
            type: 'parentPage',
            name: 'body',
            geometry: { margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } },
          },
        ],
        parentRules: [{ parent: 'body' }],
        children: [{ type: 'page', body: { html: Array.from({ length: 501 }, () => '<div style="block-size:249.4mm"></div>').join('') } }],
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
      refusal?.includes('above the pages limit of 500') === true,
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
      check(`a 2.5-column-wide ${fixture.name} table is clipped to one paper`, papers === 1, `papers=${papers}`)
    }

    const fixtures = (await page.evaluate(() => fetch('/parent-pages-print.json').then((response) => response.json()))) as {
      cases: Array<{ name: string; page: unknown }>
      inlineOverflow: unknown
      motifs: Array<{ key: string }>
      sectioned: unknown
    }
    await verifyPrintedPageInlineOverflow(page, fixtures.inlineOverflow, check)
    await page.evaluate(async (documentInput) => {
      await customElements.whenDefined('segnavia-page')
      const shown = document.createElement('segnavia-page') as HTMLElement & { page: unknown }
      shown.id = 'sectioned-page'
      shown.style.cssText = 'display:block;inline-size:800px;block-size:600px'
      shown.page = documentInput
      document.body.append(shown)
    }, fixtures.sectioned)
    const sectionedFrame = await page.locator('#sectioned-page iframe').contentFrame()
    await sectionedFrame.locator('html[data-segnavia-composed]').waitFor({ state: 'attached' })
    const shownPapers = await sectionedFrame.locator('[data-segnavia-printed-page]').count()
    const sectionedPdf = pdfWords(path.join(ROOT, 'out', 'pages-sectioned.pdf'))
    check(
      'the sectioned printed document shows the same paper count in segnavia-page and its PDF',
      sectionedPdf.length === 3 && shownPapers === sectionedPdf.length,
      `shown=${shownPapers} pdf=${sectionedPdf.length}`,
    )
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
          .map((frame) => frame.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'), undefined, { polling: 100 })),
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
