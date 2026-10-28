import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { BookInput } from '@segnavia/format'
import { Book } from '@segnavia/format'
import type { Page as Tab } from 'playwright-core'
import { BOOK_FACE_CSS, bookFixtures, ENGLISH_BOOK_ID, FAULT_CONTROL_PAGE, SHIFTED_BOOK_ID } from './book-fixtures.ts'
import { bookPageId } from './book-page-id.ts'
import { captureBookPapers, openBookBrowser, shiftTextWindowByOneLine } from './book-screen.ts'
import { bookPagesPass, faultControlFailure, pageCountRefusal } from './book-verdict.ts'
import { BOOK_MEASUREMENT_CSS, EXPECTED_MARKER_POSITION } from './config.ts'
import { type FidelitySession, finishDocument, prepareEffectless } from './measure-document.ts'
import { splitPdfPages, trimPdf } from './pdf.ts'
import type { BookFixture, DocumentResult, SizeMeasurement } from './types.ts'

const bookCss = `${BOOK_FACE_CSS}${BOOK_MEASUREMENT_CSS}`

function pageDirectory(root: string, bookId: string, page: number): string {
  const directory = path.join(root, bookPageId(bookId, page))
  mkdirSync(path.join(directory, 'readers'), { recursive: true })
  mkdirSync(path.join(directory, 'comparisons'), { recursive: true })
  return directory
}

async function renderBookPdf(
  session: FidelitySession,
  book: BookInput,
  beforeOutput?: (tab: Tab) => Promise<void>,
): Promise<{ bytes: Uint8Array; rasterEffects: number }> {
  let rasterEffects = 0
  const bytes = await session.renderer.bookPdf(book, {
    css: bookCss,
    effects: { report: (report) => (rasterEffects = report.raster ?? 0) },
    beforeOutput,
  })
  return { bytes, rasterEffects }
}

async function splitTrimmed(source: string, directory: string, name: string): Promise<string[]> {
  const split = await splitPdfPages(source, directory, name)
  const trimmed: string[] = []
  for (const [index, file] of split.entries()) {
    const destination = path.join(directory, `${name}-p${String(index + 1).padStart(2, '0')}-trim.pdf`)
    await trimPdf(file, destination)
    trimmed.push(destination)
  }
  return trimmed
}

async function writePressSplits(
  session: FidelitySession,
  book: BookInput,
  directory: string,
  name: string,
  beforeOutput?: (tab: Tab) => Promise<void>,
): Promise<{
  pressPdfs?: string[]
  pressTrimmed?: string[]
  pressReason?: string
  grayPdfs?: string[]
  grayTrimmed?: string[]
  grayBytes?: Uint8Array[]
  grayReason?: string
}> {
  const { profilePath, profileBytes, profile, table, grayProfilePath, grayProfileBytes, grayTable, defaultGrayProfile, renderer } = session
  const result: Awaited<ReturnType<typeof writePressSplits>> = {}
  if (profilePath && profileBytes && profile && table) {
    try {
      const pressPdf = path.join(directory, `${name}-press.pdf`)
      await Bun.write(pressPdf, await renderer.bookPdf(book, { css: bookCss, press: { profile: profileBytes }, beforeOutput }))
      result.pressPdfs = await splitPdfPages(pressPdf, directory, `${name}-press`)
      result.pressTrimmed = []
      for (const [index, file] of result.pressPdfs.entries()) {
        const destination = path.join(directory, `${name}-press-p${String(index + 1).padStart(2, '0')}-trim.pdf`)
        await trimPdf(file, destination)
        result.pressTrimmed.push(destination)
      }
    } catch (error) {
      result.pressReason = error instanceof Error ? error.message : String(error)
    }
  } else {
    result.pressReason = 'SEGNAVIA_FIDELITY_PROFILE was not set.'
  }
  if (grayProfilePath && grayProfileBytes && grayTable) {
    try {
      const grayPressPdf = path.join(directory, `${name}-press-gray.pdf`)
      const grayPdfBytes = await renderer.bookPdf(book, { css: bookCss, press: { profile: grayProfileBytes }, beforeOutput })
      await Bun.write(grayPressPdf, grayPdfBytes)
      result.grayPdfs = await splitPdfPages(grayPressPdf, directory, `${name}-press-gray`)
      result.grayTrimmed = []
      result.grayBytes = []
      for (const [index, file] of result.grayPdfs.entries()) {
        const destination = path.join(directory, `${name}-press-gray-p${String(index + 1).padStart(2, '0')}-trim.pdf`)
        await trimPdf(file, destination)
        result.grayTrimmed.push(destination)
        result.grayBytes.push(new Uint8Array(await Bun.file(file).arrayBuffer()))
      }
    } catch (error) {
      result.grayReason = error instanceof Error ? error.message : String(error)
    }
  } else {
    result.grayReason = `SEGNAVIA_FIDELITY_GRAY_PROFILE was not set and ${defaultGrayProfile} does not exist.`
  }
  return result
}

async function measureBookPages(
  session: FidelitySession,
  root: string,
  fixture: BookFixture,
  options: { faultControl?: boolean; beforeOutput?: (tab: Tab) => Promise<void>; pages?: number[] } = {},
): Promise<DocumentResult[]> {
  const book = Book.parse(fixture.book)
  const browser = await openBookBrowser(session.executablePath)
  let captures: Awaited<ReturnType<typeof captureBookPapers>>
  try {
    captures = await captureBookPapers(browser, book, bookCss)
  } finally {
    await browser.close().catch(() => {})
  }
  const bookDirectory = path.join(root, fixture.id)
  mkdirSync(bookDirectory, { recursive: true })
  const printed = await renderBookPdf(session, book, options.beforeOutput)
  const pdf = path.join(bookDirectory, `${fixture.id}.pdf`)
  await Bun.write(pdf, printed.bytes)
  const effectlessPdf = path.join(bookDirectory, `${fixture.id}-effectless.pdf`)
  const effectlessBytes = await session.renderer.bookPdf(book, { css: bookCss, beforeOutput: prepareEffectless })
  await Bun.write(effectlessPdf, effectlessBytes)
  const pagePdfs = await splitPdfPages(pdf, bookDirectory, fixture.id)
  const mismatch = pageCountRefusal(captures.length, pagePdfs.length)
  if (mismatch) throw new Error(mismatch)
  if (!options.faultControl && captures.length < 3) {
    throw new Error(`${fixture.title} produced ${captures.length} pages; a book fixture needs at least three.`)
  }
  const comparisonPdfs = await splitTrimmed(pdf, bookDirectory, `${fixture.id}-compare`)
  const size: SizeMeasurement = {
    pdfBytes: printed.bytes.byteLength,
    effectlessPdfBytes: effectlessBytes.byteLength,
    multiple: printed.bytes.byteLength / effectlessBytes.byteLength,
    rasterEffects: printed.rasterEffects,
  }
  const press = await writePressSplits(session, book, bookDirectory, fixture.id, options.beforeOutput)
  const selected = options.pages ?? captures.map((capture) => capture.index)
  const documents: DocumentResult[] = []
  for (const capture of captures) {
    if (!selected.includes(capture.index)) continue
    const pagePdf = pagePdfs[capture.index - 1]
    const comparisonPdf = comparisonPdfs[capture.index - 1]
    if (!pagePdf || !comparisonPdf) throw new Error(`${fixture.title} is missing PDF page ${capture.index}.`)
    const directory = pageDirectory(root, fixture.id, capture.index)
    const screen = path.join(directory, 'screen.png')
    await Bun.write(screen, capture.bytes)
    documents.push(
      await finishDocument({
        id: bookPageId(fixture.id, capture.index),
        title: `${fixture.title} p${String(capture.index).padStart(2, '0')}`,
        kind: fixture.kind,
        directory,
        screen,
        pdf: pagePdf,
        pdfBytes: size.pdfBytes,
        effectlessPdf,
        effectlessPdfBytes: size.effectlessPdfBytes,
        comparisonPdf,
        comparisonBox: {
          screen: 'paginated view paper at scale 1',
          readers: 'PDF page TrimBox',
        },
        regions: capture.regions,
        blendedFacts: capture.blendedFacts,
        rasterEffects: printed.rasterEffects,
        expectedMarker: Math.round(EXPECTED_MARKER_POSITION),
        size,
        session,
        pressFiles: {
          pressPdf: press.pressPdfs?.[capture.index - 1],
          pressComparisonPdf: press.pressTrimmed?.[capture.index - 1],
          grayPressPdf: press.grayPdfs?.[capture.index - 1],
          grayPressComparisonPdf: press.grayTrimmed?.[capture.index - 1],
          grayPressPdfBytes: press.grayBytes?.[capture.index - 1],
          pressReason: press.pressReason,
          grayPressReason: press.grayReason,
        },
        bookId: fixture.id,
        pageIndex: capture.index,
        faultControl: options.faultControl,
      }),
    )
  }
  return documents
}

export async function renderBookFixtures(session: FidelitySession, directory: string): Promise<DocumentResult[]> {
  const documents: DocumentResult[] = []
  const fixtures = await bookFixtures()
  const english = fixtures.find((fixture) => fixture.id === ENGLISH_BOOK_ID)
  if (!english) throw new Error('The English control book fixture is missing.')
  for (const fixture of fixtures) {
    console.log(`Rendering ${fixture.title}`)
    const pages = await measureBookPages(session, directory, fixture)
    if (!bookPagesPass(pages)) {
      const failed = pages.flatMap((page) =>
        Object.entries(page.bars)
          .filter(([, bar]) => !bar.passed)
          .map(([id, bar]) => `${page.id} ${id}${bar.reason ? ` (${bar.reason})` : ''}`),
      )
      throw new Error(`${fixture.title} failed the control bars: ${failed.join('; ')}.`)
    }
    documents.push(...pages)
  }
  console.log('Rendering English control book fault control')
  const shifted = await measureBookPages(
    session,
    directory,
    { ...english, id: SHIFTED_BOOK_ID, title: `${english.title} shifted` },
    {
      faultControl: true,
      pages: [FAULT_CONTROL_PAGE],
      beforeOutput: (tab) => shiftTextWindowByOneLine(tab, FAULT_CONTROL_PAGE),
    },
  )
  const fault = shifted[0]
  if (!fault) throw new Error(`The fault control has no page ${FAULT_CONTROL_PAGE}.`)
  const proof = faultControlFailure(fault)
  if (proof) throw new Error(proof)
  documents.push(fault)
  return documents
}
