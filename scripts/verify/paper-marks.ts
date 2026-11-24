import type { DocumentInput } from '@segnavia/format'
import type { Page } from 'playwright-core'
import { screenshotPixel } from './screenshot-pixel.ts'

export async function verifyPaperMarks(page: Page, pageInput: DocumentInput): Promise<[number, number, number]> {
  const marked = await page.evaluate(
    ({ input }) => {
      const paper = document.createElement('segnavia-paper') as HTMLElement & { load: (pages: unknown[], imposition: unknown) => void }
      paper.id = 'marked-paper'
      paper.style.inlineSize = '400px'
      document.body.append(paper)
      paper.load([input], {
        paper: { width: 100, height: 100, unit: 'mm' },
        columns: 1,
        rows: 1,
        cell: { width: 60, height: 60 },
        margin: { top: 20, right: 20, bottom: 20, left: 20 },
        marks: true,
      })
      return paper.id
    },
    { input: pageInput },
  )
  await page.waitForSelector(`#${marked} svg.segnavia-paper__marks line`)
  const sample = await page.locator(`#${marked}`).evaluate((paper) => {
    const svg = paper.querySelector('svg.segnavia-paper__marks') as SVGSVGElement
    const line = svg.querySelector('line') as SVGLineElement
    const rect = svg.getBoundingClientRect()
    const viewBox = svg.viewBox.baseVal
    const x = (Number(line.getAttribute('x1')) + Number(line.getAttribute('x2'))) / 2
    const y = (Number(line.getAttribute('y1')) + Number(line.getAttribute('y2'))) / 2
    return { x: rect.x + (x / viewBox.width) * rect.width, y: rect.y + (y / viewBox.height) * rect.height }
  })
  return screenshotPixel(await page.screenshot({ clip: { x: sample.x, y: sample.y, width: 1, height: 1 } }))
}
