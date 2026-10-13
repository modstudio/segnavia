import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import {
  containedImposition,
  coveringImposition,
  fixedImposedPage,
  labelPages,
  labelsImposition,
  postcardBackPage,
  postcardPage,
} from './demo-page-fixtures.ts'

export async function buildPagePdfs(renderer: Renderer, output: string): Promise<void> {
  writeFileSync(path.join(output, 'pages-postcard.pdf'), await renderer.pagesPdf([postcardPage, postcardBackPage]))
  writeFileSync(path.join(output, 'pages-labels.pdf'), await renderer.pagesPdf(labelPages.slice(0, 30), { imposition: labelsImposition }))
  writeFileSync(path.join(output, 'pages-labels-31.pdf'), await renderer.pagesPdf(labelPages, { imposition: labelsImposition }))
  writeFileSync(
    path.join(output, 'pages-labels-rtl.pdf'),
    await renderer.pagesPdf(labelPages.slice(0, 30), { imposition: { ...labelsImposition, dir: 'rtl' } }),
  )
  writeFileSync(path.join(output, 'pages-cover.pdf'), await renderer.pagesPdf([fixedImposedPage], { imposition: coveringImposition }))
  writeFileSync(path.join(output, 'pages-contain.pdf'), await renderer.pagesPdf([fixedImposedPage], { imposition: containedImposition }))
  const refusal = await renderer.pagesPdf(labelPages, { imposition: labelsImposition, limits: { maxSheets: 1 } }).then(
    () => 'rendered',
    (error) => (error instanceof Error ? error.message : `unexpected ${error}`),
  )
  writeFileSync(path.join(output, 'pages-limits.txt'), refusal)
}
