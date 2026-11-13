import { htmlTextSample, resolveDirection, type SlotDeclaration } from '@segnavia/format'
import { Text } from 'domhandler'
import { elements, parse, serialize } from './sanitize.ts'

export interface RecordValueSection {
  html: string
  values?: Record<string, string>
  recordTemplate?: { name: string; slots: readonly Pick<SlotDeclaration, 'key'>[] }
  recordBody?: string
}

export type BoundRecordSection<T extends RecordValueSection> = Omit<T, 'recordBody' | 'values'> & {
  recordBody?: never
  values?: never
}

type HtmlDocument = ReturnType<typeof parse>
type HtmlElement = ReturnType<typeof elements>[number]

function composeRecordBody(section: RecordValueSection, document: HtmlDocument): HtmlElement | undefined {
  const bodyPoints = elements(document.children).filter((element) => element.attribs['data-record-body'] !== undefined)
  const bodyPoint = bodyPoints[0]
  if (bodyPoint && section.recordTemplate) {
    const body = section.recordBody === undefined ? [] : parse(section.recordBody).children
    for (const child of body) child.parent = bodyPoint
    bodyPoint.children = body
    delete bodyPoint.attribs['data-record-body']
    if (section.recordBody !== undefined) bodyPoint.attribs.dir = resolveDirection(undefined, undefined, htmlTextSample(section.recordBody))
  }
  return bodyPoint
}

function recordBindings(document: HtmlDocument): Map<string, HtmlElement[]> {
  const bindings = new Map<string, HtmlElement[]>()
  for (const element of elements(document.children)) {
    const key = element.attribs['data-slot-value']
    if (key === undefined) continue
    const held = bindings.get(key) ?? []
    held.push(element)
    bindings.set(key, held)
  }
  return bindings
}

function refuseUnboundSlots(template: NonNullable<RecordValueSection['recordTemplate']>, bindings: ReadonlyMap<string, HtmlElement[]>): void {
  for (const slot of template.slots) {
    if (!bindings.has(slot.key)) {
      throw new RangeError(
        `Template ${JSON.stringify(template.name)} declares slot ${JSON.stringify(slot.key)} but its HTML never binds it; add data-slot-value=${JSON.stringify(slot.key)} to clear this refusal.`,
      )
    }
  }
}

function fillRecordValues(values: Record<string, string>, bindings: ReadonlyMap<string, HtmlElement[]>): void {
  for (const [key, value] of Object.entries(values)) {
    for (const element of bindings.get(key) ?? []) {
      delete element.attribs['data-slot-value']
      const text = new Text(value)
      text.parent = element
      element.children = [text]
      if (element.attribs.dir === undefined) element.attribs.dir = 'auto'
    }
  }
}

export function bindRecordValues<T extends RecordValueSection>(section: T): BoundRecordSection<T> {
  const document = parse(section.html)
  const bodyPoint = composeRecordBody(section, document)
  if (!section.values || !section.recordTemplate) {
    const { recordBody: _recordBody, ...composed } = section
    return { ...composed, html: serialize(document) } as BoundRecordSection<T>
  }
  const bindings = recordBindings(document)
  refuseUnboundSlots(section.recordTemplate, bindings)
  fillRecordValues(section.values, bindings)
  if (bodyPoint && section.recordBody !== undefined)
    bodyPoint.attribs.dir = resolveDirection(undefined, undefined, htmlTextSample(serialize(bodyPoint.children)))
  const { recordBody: _recordBody, values: _values, ...bound } = section
  return { ...bound, html: serialize(document) } as BoundRecordSection<T>
}
