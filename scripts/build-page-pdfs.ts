import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MotifsOptions, Renderer } from '@segnavia/render'
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
  parentPageEnglish,
  parentPageHebrew,
  parentPageMixed,
  postcardBackPage,
  postcardPage,
  twoSidedCardImposition,
  twoSidedCardPages,
  twoSidedSequenceImposition,
} from './demo-page-fixtures.ts'

export async function buildPagePdfs(renderer: Renderer, output: string): Promise<void> {
  const motifs: MotifsOptions = {
    source: {
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
              { lang: 'en', html: '<bdi>Page <span data-slot-value="printedPage.number"></span> of <span data-slot-value="printedPage.total"></span></bdi>' },
              { lang: 'he', html: '<bdi>עמוד <span data-slot-value="printedPage.number"></span> מתוך <span data-slot-value="printedPage.total"></span></bdi>' },
            ],
          }
        }
        return undefined
      },
    },
  }
  writeFileSync(path.join(output, 'pages-parent-english.pdf'), await renderer.pagePdf(parentPageEnglish, { motifs }))
  writeFileSync(path.join(output, 'pages-parent-hebrew.pdf'), await renderer.pagePdf(parentPageHebrew, { motifs }))
  writeFileSync(path.join(output, 'pages-parent-mixed.pdf'), await renderer.pagesPdf([parentPageMixed], { motifs }))
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
  const refusal = await renderer.pagesPdf(labelPages, { imposition: labelsImposition, limits: { maxSheets: 1 } }).then(
    () => 'rendered',
    (error) => (error instanceof Error ? error.message : `unexpected ${error}`),
  )
  writeFileSync(path.join(output, 'pages-limits.txt'), refusal)
}
