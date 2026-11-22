import type { Variable } from '@segnavia/format'
import type { BookDocument } from '@segnavia/html'
import type { MarginContentSetPoint } from './book-margin-facts.ts'
import type { PrintedPart, TextBaselineReader } from './book-pdf-types.ts'
import { RenderRefusedError } from './errors.ts'
import { setPointAtPageStart } from './pdfjs-browser.ts'

export async function continuousContentSetPoints(
  document: Pick<BookDocument, 'setPoints'>,
  part: PrintedPart,
  variables: readonly Variable[],
  readTextBaselines?: TextBaselineReader,
): Promise<MarginContentSetPoint[]> {
  const points = document.setPoints.map((point): Omit<MarginContentSetPoint, 'atStart'> => {
    const destination = part.destinations.get(point.id)
    if (!destination) throw new RenderRefusedError(`Chromium wrote no named destination for hidden target ${point.id}.`)
    return { ...point, page: destination.page, y: destination.y }
  })
  const needsStart = variables.some((variable) => variable.kind === 'text' && variable.from === 'content' && variable.pick === 'start')
  if (!needsStart || points.length === 0) return points.map((point) => ({ ...point, atStart: false }))
  if (!part.bytes || !readTextBaselines) {
    throw new RenderRefusedError('Resolving a continuous content variable picked from start needs PDF text inspection.')
  }
  const pages = [...new Set(points.map((point) => point.page))]
  const baselines = await readTextBaselines(part.bytes, pages)
  return points.map((point) => {
    if (!baselines.has(point.page)) throw new RenderRefusedError(`PDF text inspection returned no result for page ${point.page}.`)
    return { ...point, atStart: setPointAtPageStart(baselines.get(point.page) ?? null, point.y) }
  })
}
