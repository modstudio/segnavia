import { type AsOfDay, type BookView, dayWithHostMoment, resolveAsOfDay } from '@segnavia/format'
import { fillBookViewAsOfBindings, resolveDayContextsFor } from '@segnavia/html'
import type { captureAsOfLoad } from './as-of-element.ts'
import { prepareBookViewWithoutSources } from './book-motifs.ts'
import { hasDiagram, loadDiagramScriptResult } from './diagram-document.ts'

export function resolveBookDiagram(view: BookView, settled: boolean) {
  if (settled || !hasDiagram(`${view.html}${view.flow ?? ''}`)) return undefined
  return loadDiagramScriptResult(`${view.html}${view.flow ?? ''}`)
}

export function initialBookView(view: BookView, hasSources: boolean) {
  if (hasSources || hasDiagram(`${view.html}${view.flow ?? ''}`)) return undefined
  return prepareBookViewWithoutSources(view)
}

export function resolveBookViewDay(
  view: BookView,
  inputs: ReturnType<typeof captureAsOfLoad>,
  signal: AbortSignal,
): { day: AsOfDay; view: BookView } | Promise<{ day: AsOfDay; view: BookView }> {
  const resolution = resolveAsOfDay(view.asOf, inputs)
  if (resolution.kind === 'day') {
    const day = dayWithHostMoment(resolution.day, inputs.hostMoment)
    return { day, view: fillBookViewAsOfBindings(view, day) }
  }
  return resolveDayContextsFor(
    [view],
    {
      moment: inputs.moment,
      anchors: inputs.anchors,
      asOf: inputs.hostZone === undefined ? undefined : { zone: inputs.hostZone },
    },
    undefined,
    signal,
  ).then((contexts) => {
    const day = contexts.days[0] as AsOfDay
    return { day, view: fillBookViewAsOfBindings(view, day) }
  })
}
