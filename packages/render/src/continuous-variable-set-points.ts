import { isContentTextVariable, type Variable } from '@segnavia/format'
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
    if (!destination) throw new Error('continuousContentSetPoints requires requireTargets to verify every set-point destination first.')
    return { ...point, page: destination.page, y: destination.y }
  })
  const startVariables = variables.filter(isContentTextVariable).filter((variable) => variable.pick === 'start')
  if (startVariables.length === 0 || points.length === 0) return points.map((point) => ({ ...point, atStart: false }))
  if (!part.bytes || !readTextBaselines) {
    throw new RenderRefusedError(
      `Content variable${startVariables.length === 1 ? '' : 's'} ${startVariables.map((variable) => variable.name).join(', ')} pick${startVariables.length === 1 ? 's' : ''} start in a continuous book, which needs printed-text inspection; supply the print adapter textBaselines reader, pick first or last, or use paginated mode to clear this refusal.`,
    )
  }
  const pages = [...new Set(points.map((point) => point.page))]
  const baselines = await readTextBaselines(part.bytes, pages)
  return points.map((point) => {
    if (!baselines.has(point.page)) throw new RenderRefusedError(`PDF text inspection returned no result for page ${point.page}.`)
    return { ...point, atStart: setPointAtPageStart(baselines.get(point.page) ?? null, point.y) }
  })
}
