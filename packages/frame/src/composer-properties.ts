import type { MeasureKind, MeasuredProperty } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import {
  logicalExtent,
  logicalLineCount,
  measuredProperties,
  propertyValue,
  runPropertyStageOnce,
  verticalWritingMode,
} from './composer-properties-policy.ts'

interface TemporaryPropertySource {
  clone: HTMLElement
  fitted: HTMLElement
  source: HTMLElement
}

interface PropertyGeometry {
  paperWidth: number
  paperHeight: number
  parents: Array<{ textArea: { width: number; height: number } }>
}

function directMeasurementNodes(element: HTMLElement): Node[] {
  const nodes = Array.from(element.childNodes).filter((node) => node.nodeType === 1 || (node.nodeType === 3 && (node.textContent ?? '').length > 0))
  return nodes.length > 0 ? nodes : [element]
}

function graphemeInlineExtent(node: Node, writingMode: string): number {
  const owner = node.ownerDocument
  if (!owner) return 0
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const walker = owner.createTreeWalker(node, 4)
  let total = 0
  const texts = node.nodeType === 3 ? [node as Text] : []
  let found = walker.nextNode() as Text | null
  while (found) {
    texts.push(found)
    found = walker.nextNode() as Text | null
  }
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

function lineRects(element: HTMLElement): Array<{ width: number; height: number; top: number; left: number }> {
  const range = element.ownerDocument.createRange()
  range.selectNodeContents(element)
  return Array.from(range.getClientRects()).map((rect) => ({ width: rect.width, height: rect.height, top: rect.top, left: rect.left }))
}

function measuredValue(element: HTMLElement, kind: MeasureKind): string {
  const writingMode = getComputedStyle(element).writingMode
  let value: number
  if (kind === 'max-content-inline:children') {
    value = Math.max(0, ...directMeasurementNodes(element).map((node) => graphemeInlineExtent(node, writingMode)))
  } else if (kind === 'block') {
    value = logicalExtent(element.getBoundingClientRect(), writingMode, 'block')
  } else {
    const rects = lineRects(element)
    value = rects.length > 0 ? logicalLineCount(rects, writingMode) : element.getClientRects().length > 0 ? 1 : 0
  }
  return propertyValue(kind, value)
}

function measurePropertyElement(element: HTMLElement): MeasuredProperty {
  const kind = element.getAttribute('data-measure') as MeasureKind
  const name = element.getAttribute('data-measure-as') ?? ''
  const id = element.getAttribute('data-segnavia-id') ?? element.closest<HTMLElement>('[data-segnavia-id]')?.getAttribute('data-segnavia-id')
  if (!id) throw new Error('data-measure has no identified block subject; place it in a block element to clear this refusal')
  return { id, name, value: measuredValue(element, kind) }
}

function propertySources(
  root: ParentNode,
  geometry: (name: string | null | undefined) => PropertyGeometry,
  defaultDirection: string,
  defaultLang: string,
  selector: string,
): { ordinary: HTMLElement[]; temporary: TemporaryPropertySource[] } {
  const shared = globalThis as typeof globalThis & {
    designedFits?: (
      root: ParentNode,
      geometry: (name: string | null | undefined) => PropertyGeometry,
      defaultDirection: string,
      defaultLang: string,
      selector: string,
    ) => TemporaryPropertySource[]
    templateFits?: (
      root: ParentNode,
      geometry: (name: string | null | undefined) => PropertyGeometry,
      defaultDirection: string,
      defaultLang: string,
      selector: string,
    ) => TemporaryPropertySource[]
  }
  const temporary = [
    ...(shared.templateFits?.(root, geometry, defaultDirection, defaultLang, selector) ?? []),
    ...(shared.designedFits?.(root, geometry, defaultDirection, defaultLang, selector) ?? []),
  ]
  const ordinary = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (element) =>
      !element.closest('[data-segnavia-template],[data-segnavia-templated-page],[data-segnavia-designed-page]') && element.getClientRects().length > 0,
  )
  return { ordinary, temporary }
}

function measureSourcePropertiesImplementation(
  root: ParentNode,
  geometry: (name: string | null | undefined) => PropertyGeometry,
  defaultDirection: string,
  defaultLang: string,
): MeasuredProperty[] {
  const shared = globalThis as typeof globalThis & {
    measurePropertyElement?: typeof measurePropertyElement
    measuredProperties?: typeof measuredProperties
    propertySources?: typeof propertySources
  }
  const { ordinary, temporary } = (shared.propertySources ?? propertySources)(root, geometry, defaultDirection, defaultLang, '[data-measure]')
  const results: MeasuredProperty[] = []
  for (const element of ordinary) {
    const result = (shared.measurePropertyElement ?? measurePropertyElement)(element)
    element.style.setProperty(result.name, result.value)
    results.push(result)
  }
  for (const entry of temporary) {
    const result = (shared.measurePropertyElement ?? measurePropertyElement)(entry.fitted)
    entry.source.style.setProperty(result.name, result.value)
    results.push(result)
  }
  for (const entry of temporary) entry.clone.remove()
  return (shared.measuredProperties ?? measuredProperties)(results)
}

export function embeddedComposerPropertyFunctions(): string {
  return `${embedFunction('verticalWritingMode', verticalWritingMode)}
${embedFunction('logicalExtent', logicalExtent)}
${embedFunction('logicalLineCount', logicalLineCount)}
${embedFunction('propertyValue', propertyValue)}
${embedFunction('measuredProperties', measuredProperties)}
${embedFunction('runPropertyStageOnce', runPropertyStageOnce)}
${embedFunction('directMeasurementNodes', directMeasurementNodes)}
${embedFunction('graphemeInlineExtent', graphemeInlineExtent)}
${embedFunction('lineRects', lineRects)}
${embedFunction('measuredValue', measuredValue)}
${embedFunction('measurePropertyElement', measurePropertyElement)}
${embedFunction('propertySources', propertySources)}
${embedFunction('measureSourcePropertiesImplementation', measureSourcePropertiesImplementation)}
var propertyStageState={done:false,results:[]};
var measureSourceProperties=function(){return runPropertyStageOnce(propertyStageState,function(){return measureSourcePropertiesImplementation(document,geometryFor,config.direction,config.lang);});};`
}
