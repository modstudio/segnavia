import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MotifsOptions, Renderer } from '@segnavia/render'
import { editionWorksheet, worksheetPage } from './demo-field-fixture.ts'
import { printedMixedPaperBleedDocument, printedMixedPaperDocument } from './demo-mixed-paper-fixture.ts'
import {
  bleedGridImposition,
  bleedGridPages,
  clippedBleedGridImposition,
  containedImposition,
  coveringImposition,
  fixedImposedPage,
  growingFixedImposition,
  growingFixedPages,
  labelPages,
  labelsImposition,
  letterFoldImposition,
  letterFoldPages,
  parentPageFurnitureOverflow,
  parentPageInlineOverflow,
  parentPageNarrowBreak,
  parentPageUnsizedImage,
  postcardBackPage,
  postcardPage,
  printedPageMotifSource,
  printedPageMotifs,
  printedParentPageCases,
  printedSectionDocument,
  printedSectionPressDocument,
  twoSidedCardImposition,
  twoSidedCardPages,
  twoSidedSequenceImposition,
} from './demo-page-fixtures.ts'
import { hebrewRecordsDocument, recordsTableDocument } from './demo-record-fixtures.ts'

function buildParentPageBrowserFixtures(site: string): void {
  writeFileSync(
    path.join(site, 'parent-pages-print.json'),
    JSON.stringify({ cases: printedParentPageCases, inlineOverflow: parentPageInlineOverflow, motifs: printedPageMotifs, sectioned: printedSectionDocument }),
  )
}

export async function buildPagePdfs(renderer: Renderer, output: string, site?: string): Promise<void> {
  if (site) buildParentPageBrowserFixtures(site)
  const motifs: MotifsOptions = {
    source: printedPageMotifSource,
  }
  let englishOverflow = ''
  for (const fixture of printedParentPageCases) {
    const pdf =
      fixture.name === 'mixed'
        ? await renderer.pagesPdf([fixture.page], { motifs })
        : await renderer.pagePdf(fixture.page, {
            motifs,
            ...(fixture.name === 'english' ? { overflow: { report: (report) => (englishOverflow = JSON.stringify(report)) } } : {}),
          })
    writeFileSync(path.join(output, `pages-parent-${fixture.name}.pdf`), pdf)
  }
  writeFileSync(path.join(output, 'pages-parent-english-overflow.json'), englishOverflow)
  writeFileSync(path.join(output, 'pages-sectioned.pdf'), await renderer.pagePdf(printedSectionDocument))
  writeFileSync(path.join(output, 'pages-sectioned-multi.pdf'), await renderer.pagesPdf([printedSectionDocument]))
  writeFileSync(path.join(output, 'pages-sectioned-press.pdf'), await renderer.pagePdf(printedSectionPressDocument))
  writeFileSync(path.join(output, 'pages-mixed-paper.pdf'), await renderer.pagePdf(printedMixedPaperDocument))
  writeFileSync(path.join(output, 'pages-mixed-paper-bleed.pdf'), await renderer.pagePdf(printedMixedPaperBleedDocument))
  writeFileSync(path.join(output, 'records-table.pdf'), await renderer.pagePdf(recordsTableDocument))
  writeFileSync(path.join(output, 'records-hebrew.pdf'), await renderer.pagePdf(hebrewRecordsDocument))
  writeFileSync(path.join(output, 'page-worksheet.pdf'), await renderer.pagePdf(worksheetPage))
  writeFileSync(path.join(output, 'worksheet-student.pdf'), await renderer.bookPdf(editionWorksheet, { edition: 'student' }))
  writeFileSync(path.join(output, 'worksheet-teacher.pdf'), await renderer.bookPdf(editionWorksheet, { edition: 'teacher' }))
  writeFileSync(path.join(output, 'pages-parent-unsized-image.pdf'), await renderer.pagePdf(parentPageUnsizedImage, { motifs }))
  writeFileSync(path.join(output, 'pages-parent-narrow-break.pdf'), await renderer.pagePdf(parentPageNarrowBreak, { motifs }))
  let furnitureOverflow = ''
  writeFileSync(
    path.join(output, 'pages-parent-furniture-overflow.pdf'),
    await renderer.pagePdf(parentPageFurnitureOverflow, { overflow: { report: (report) => (furnitureOverflow = JSON.stringify(report)) } }),
  )
  writeFileSync(path.join(output, 'pages-parent-furniture-overflow.json'), furnitureOverflow)
  writeFileSync(path.join(output, 'pages-postcard.pdf'), await renderer.pagesPdf([postcardPage, postcardBackPage]))
  writeFileSync(path.join(output, 'pages-labels.pdf'), await renderer.pagesPdf(labelPages.slice(0, 30), { imposition: labelsImposition }))
  writeFileSync(path.join(output, 'pages-labels-31.pdf'), await renderer.pagesPdf(labelPages, { imposition: labelsImposition }))
  writeFileSync(
    path.join(output, 'pages-labels-rtl.pdf'),
    await renderer.pagesPdf(labelPages.slice(0, 30), { imposition: { ...labelsImposition, dir: 'rtl' } }),
  )
  writeFileSync(path.join(output, 'pages-cover.pdf'), await renderer.pagesPdf([fixedImposedPage], { imposition: coveringImposition }))
  writeFileSync(path.join(output, 'pages-contain.pdf'), await renderer.pagesPdf([fixedImposedPage], { imposition: containedImposition }))
  writeFileSync(path.join(output, 'pages-bleed-grid.pdf'), await renderer.pagesPdf(bleedGridPages, { imposition: bleedGridImposition }))
  writeFileSync(path.join(output, 'pages-bleed-grid-clipped.pdf'), await renderer.pagesPdf(bleedGridPages, { imposition: clippedBleedGridImposition }))
  writeFileSync(path.join(output, 'pages-growing-fixed.pdf'), await renderer.pagesPdf(growingFixedPages, { imposition: growingFixedImposition }))
  writeFileSync(path.join(output, 'pages-letter-fold.pdf'), await renderer.pagesPdf(letterFoldPages, { imposition: letterFoldImposition }))
  writeFileSync(path.join(output, 'pages-two-sided-long.pdf'), await renderer.pagesPdf(twoSidedCardPages, { imposition: twoSidedCardImposition }))
  writeFileSync(
    path.join(output, 'pages-two-sided-marks.pdf'),
    await renderer.pagesPdf(twoSidedCardPages, { imposition: { ...twoSidedCardImposition, marks: true } }),
  )
  writeFileSync(
    path.join(output, 'pages-two-sided-short.pdf'),
    await renderer.pagesPdf(twoSidedCardPages, { imposition: { ...twoSidedCardImposition, flip: 'short' } }),
  )
  writeFileSync(
    path.join(output, 'pages-two-sided-odd.pdf'),
    await renderer.pagesPdf(twoSidedCardPages.slice(0, 5), { imposition: twoSidedSequenceImposition }),
  )
  const refusal = await renderer.pagesPdf(labelPages, { imposition: labelsImposition, limits: { sheets: 1 } }).then(
    () => 'rendered',
    (error) => (error instanceof Error ? error.message : `unexpected ${error}`),
  )
  writeFileSync(path.join(output, 'pages-limits.txt'), refusal)
}
