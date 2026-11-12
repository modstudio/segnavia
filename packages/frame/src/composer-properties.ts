import { MEASURE_KIND_MODEL, type MeasuredProperty, type MeasureKind } from '@segnavia/format'
import { logicalExtent } from './composer-axis-policy.ts'
import { designedFits, templateFits } from './composer-fit.ts'
import { measuredProperties, propertyCssValue } from './composer-properties-policy.ts'
import { blockSubject, type SourceGeometry, type StagedSource, stagedSourceExcluded } from './composer-source-staging.ts'

type LineBoxes = (element: HTMLElement) => readonly unknown[]

export function directMeasurementNodes(element: HTMLElement): Node[] {
  const nodes = Array.from(element.childNodes).filter((node) => node.nodeType === 1 || (node.nodeType === 3 && (node.textContent ?? '').length > 0))
  return nodes.length > 0 ? nodes : [element]
}

export function graphemeInlineExtent(node: Node, writingMode: string): number {
  const owner = node.ownerDocument
  if (!owner) return 0
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const walker = owner.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  const texts = node.nodeType === 3 ? [node as Text] : []
  let found = walker.nextNode() as Text | null
  while (found) {
    texts.push(found)
    found = walker.nextNode() as Text | null
  }
  if (texts.length === 0 && 'getBoundingClientRect' in node) return logicalExtent((node as HTMLElement).getBoundingClientRect(), writingMode, 'inline')
  let total = 0
  for (const text of texts) {
    for (const part of segmenter.segment(text.data)) {
      const range = owner.createRange()
      range.setStart(text, part.index)
      range.setEnd(text, part.index + part.segment.length)
      total += logicalExtent(range.getBoundingClientRect(), writingMode, 'inline')
    }
  }
  return total
}

const MEASURERS: Record<MeasureKind, (element: HTMLElement, writingMode: string, lineBoxes: LineBoxes) => number> = {
  'max-content-inline:children': (element, writingMode) =>
    Math.max(0, ...directMeasurementNodes(element).map((node) => graphemeInlineExtent(node, writingMode))),
  block: (element, writingMode) => logicalExtent(element.getBoundingClientRect(), writingMode, 'block'),
  'line-count': (element, _writingMode, lineBoxes) => lineBoxes(element).length,
}

export function measuredValue(element: HTMLElement, kind: MeasureKind, lineBoxes: LineBoxes): number {
  return Math.max(0, MEASURERS[kind](element, getComputedStyle(element).writingMode, lineBoxes))
}

export function measurePropertyElement(element: HTMLElement, lineBoxes: LineBoxes): MeasuredProperty {
  const authored = element.getAttribute('data-measure') ?? ''
  const model = MEASURE_KIND_MODEL[authored as MeasureKind]
  const measure = MEASURERS[authored as MeasureKind]
  if (!model || !measure) throw new Error(`data-measure ${JSON.stringify(authored)} is unknown; use a supported measure kind to clear this refusal`)
  const kind = authored as MeasureKind
  const name = element.getAttribute('data-measure-as') ?? ''
  const id = blockSubject(element)
  if (!id) throw new Error('data-measure has no identified block subject; add data-segnavia-id to it or a block ancestor to clear this refusal')
  const value = measuredValue(element, kind, lineBoxes)
  return { id, name, kind, value: kind === 'line-count' ? Math.round(value) : Math.round(value * 10_000) / 10_000, unit: model.unit }
}

export function requireMeasuredLayout(element: HTMLElement): void {
  if (element.getClientRects().length > 0) return
  const id = blockSubject(element)
  if (!id) throw new Error('data-measure has no identified block subject; add data-segnavia-id to it or a block ancestor to clear this refusal')
  throw new Error(`data-measure on block "${id}" has no layout boxes; make the element laid out or remove data-measure to clear this refusal`)
}

export function propertySources(
  root: ParentNode,
  geometry: (name: string | null | undefined) => SourceGeometry,
  defaultDirection: string,
  defaultLang: string,
  selector: string,
): { ordinary: HTMLElement[]; temporary: StagedSource[] } {
  const temporary = [
    ...templateFits(root, geometry, defaultDirection, defaultLang, selector, 'data-measure'),
    ...designedFits(root, geometry, defaultDirection, defaultLang, selector, 'data-measure'),
  ]
  const ordinary = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) => !stagedSourceExcluded(element))
  for (const element of ordinary) requireMeasuredLayout(element)
  for (const entry of temporary) requireMeasuredLayout(entry.fitted)
  return { ordinary, temporary }
}

export function measureSourcePropertiesImplementation(
  root: ParentNode,
  geometry: (name: string | null | undefined) => SourceGeometry,
  defaultDirection: string,
  defaultLang: string,
  lineBoxes: LineBoxes,
): MeasuredProperty[] {
  const { ordinary, temporary } = propertySources(root, geometry, defaultDirection, defaultLang, '[data-measure]')
  const results: MeasuredProperty[] = []
  for (const element of ordinary) {
    const result = measurePropertyElement(element, lineBoxes)
    element.style.setProperty(result.name, propertyCssValue(result))
    results.push(result)
  }
  for (const entry of temporary) {
    const result = measurePropertyElement(entry.fitted, lineBoxes)
    entry.source.style.setProperty(result.name, propertyCssValue(result))
    results.push(result)
  }
  for (const entry of temporary) entry.clone.remove()
  return measuredProperties(results)
}
