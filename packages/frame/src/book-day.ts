import { type AsOfDay, type BookView, dayWithHostMoment, type PageWidths, type PreflightProfile, resolveAsOfDay } from '@segnavia/format'
import { fillBookViewAsOfBindings, resolveDayContextsFor } from '@segnavia/html'
import { asOfContextInputs, type captureAsOfLoad } from './as-of-element.ts'
import { prepareBookView, prepareBookViewWithoutSources } from './book-motifs.ts'
import { hasDiagram, loadDiagramScriptResult } from './diagram-document.ts'
import { type LoadedLayoutScript, layoutsUsed, loadLayoutScripts } from './layout.ts'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'

function resolveBookDiagram(view: BookView, settled: boolean) {
  if (settled || !hasDiagram(`${view.html}${view.flow ?? ''}`)) return undefined
  return loadDiagramScriptResult(`${view.html}${view.flow ?? ''}`)
}

type InitialBookView = { kind: 'ready'; prepared: ReturnType<typeof prepareBookViewWithoutSources> } | { kind: 'refused' } | { kind: 'deferred' }

function initialBookView(view: BookView, hasSources: boolean, failed?: (reason: unknown) => void): InitialBookView {
  const html = `${view.html}${view.flow ?? ''}`
  if (hasSources || hasDiagram(html) || layoutsUsed(html).length > 0) return { kind: 'deferred' }
  try {
    return { kind: 'ready', prepared: prepareBookViewWithoutSources(view) }
  } catch (reason) {
    failed?.(reason)
    return { kind: 'refused' }
  }
}

async function prepareDatedBookView(
  view: BookView,
  day: AsOfDay,
  options: {
    diagramSettled: boolean
    motifs?: MotifsOptions
    fonts?: FontsOptions
    placements?: PlacementsOptions
    pageWidths?: PageWidths
    profile: PreflightProfile
    signal: AbortSignal
  },
) {
  const diagram = await resolveBookDiagram(view, options.diagramSettled)
  const html = `${view.html}${view.flow ?? ''}`
  const layoutScripts = layoutsUsed(html).length > 0 ? await loadLayoutScripts(html) : []
  const prepared =
    !options.motifs && !options.fonts && !options.placements
      ? prepareBookViewWithoutSources(view)
      : await prepareBookView(view, options.motifs, options.fonts, options.signal, options.placements, options.pageWidths, day, options.profile)
  return { diagram, layoutScripts, prepared }
}

export function startBookViewLoad(
  view: BookView,
  inputs: ReturnType<typeof captureAsOfLoad>,
  options: {
    motifs?: MotifsOptions
    fonts?: FontsOptions
    placements?: PlacementsOptions
    pageWidths?: PageWidths
    profile: PreflightProfile
    signal: AbortSignal
    diagramSettled: boolean
    current(): boolean
    day(day: AsOfDay): void
    diagram(result: Awaited<ReturnType<typeof loadDiagramScriptResult>>): void
    layout(scripts: readonly LoadedLayoutScript[]): void
    prepared(result: ReturnType<typeof prepareBookViewWithoutSources>, view: BookView): void
    failed(reason: unknown): void
    settled(): void
  },
): void {
  let resolved: ReturnType<typeof resolveBookViewDay>
  try {
    resolved = resolveBookViewDay(view, inputs, options.signal)
  } catch (reason) {
    if (options.current()) options.failed(reason)
    options.settled()
    return
  }
  const accept = async ({ day, view: filled }: { day: AsOfDay; view: BookView }) => {
    if (!options.current()) return
    options.day(day)
    const initial = initialBookView(filled, Boolean(options.motifs || options.fonts || options.placements), options.failed)
    if (initial.kind === 'refused' || !options.current()) return
    if (initial.kind === 'ready') {
      options.prepared(initial.prepared, filled)
      return
    }
    const result = await prepareDatedBookView(filled, day, options)
    if (!options.current()) return
    if (result.diagram) options.diagram(result.diagram)
    options.layout(result.layoutScripts)
    options.prepared(result.prepared, filled)
  }
  if (!(resolved instanceof Promise)) {
    const initial = initialBookView(resolved.view, Boolean(options.motifs || options.fonts || options.placements), options.failed)
    if (initial.kind === 'refused') {
      options.settled()
      return
    }
    if (initial.kind === 'ready') {
      if (options.current()) {
        options.day(resolved.day)
        options.prepared(initial.prepared, resolved.view)
      }
      options.settled()
      return
    }
  }
  void Promise.resolve(resolved)
    .then(accept)
    .catch((reason) => {
      if (options.current()) options.failed(reason)
    })
    .finally(options.settled)
}

function resolveBookViewDay(
  view: BookView,
  inputs: ReturnType<typeof captureAsOfLoad>,
  signal: AbortSignal,
): { day: AsOfDay; view: BookView } | Promise<{ day: AsOfDay; view: BookView }> {
  const resolution = resolveAsOfDay(view.asOf, inputs)
  if (resolution.kind === 'day') {
    const day = dayWithHostMoment(resolution.day, inputs.hostMoment)
    return { day, view: fillBookViewAsOfBindings(view, day) }
  }
  return resolveDayContextsFor([view], asOfContextInputs(inputs), undefined, signal).then((contexts) => {
    const day = contexts.days[0] as AsOfDay
    return { day, view: fillBookViewAsOfBindings(view, day) }
  })
}
