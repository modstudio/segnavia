import { htmlTextSample, resolveDirection, type SlotDeclaration } from '@segnavia/format'
import { Text } from 'domhandler'
import { elements, parse, serialize } from './sanitize.ts'

export interface RecordValueSection {
  html: string
  values?: Record<string, string>
  recordTemplate?: { name: string; slots: readonly Pick<SlotDeclaration, 'key'>[] }
  recordBody?: string
}

export type BoundRecordSection<T extends RecordValueSection> = Omit<T, 'recordBody' | 'recordTemplate' | 'values'> & {
  recordBody?: never
  recordTemplate?: never
  values?: never
}

export function bindRecordValues<T extends RecordValueSection>(section: T): BoundRecordSection<T> {
  const document = parse(section.html)
  const bodyPoints = elements(document.children).filter((element) => element.attribs['data-record-body'] !== undefined)
  const bodyPoint = bodyPoints[0]
  if (bodyPoint && section.recordTemplate) {
    const body = section.recordBody === undefined ? [] : parse(section.recordBody).children
    for (const child of body) child.parent = bodyPoint
    bodyPoint.children = body
    if (section.recordBody !== undefined) bodyPoint.attribs.dir = resolveDirection(undefined, undefined, htmlTextSample(section.recordBody))
  }
  if (!section.values || !section.recordTemplate) {
    const { recordBody: _recordBody, recordTemplate: _recordTemplate, ...composed } = section
    return { ...composed, html: serialize(document) } as BoundRecordSection<T>
  }
  const bindings = new Map<string, ReturnType<typeof elements>[number][]>()
  for (const element of elements(document.children)) {
    const key = element.attribs['data-slot-value']
    if (key === undefined) continue
    const held = bindings.get(key) ?? []
    held.push(element)
    bindings.set(key, held)
  }
  for (const slot of section.recordTemplate.slots) {
    if (!bindings.has(slot.key)) {
      throw new RangeError(
        `Template ${JSON.stringify(section.recordTemplate.name)} declares slot ${JSON.stringify(slot.key)} but its HTML never binds it; add data-slot-value=${JSON.stringify(slot.key)} to clear this refusal.`,
      )
    }
  }
  for (const [key, value] of Object.entries(section.values)) {
    for (const element of bindings.get(key) ?? []) {
      delete element.attribs['data-slot-value']
      const text = new Text(value)
      text.parent = element
      element.children = [text]
      if (element.attribs.dir === undefined) element.attribs.dir = 'auto'
    }
  }
  if (bodyPoint && section.recordBody !== undefined) bodyPoint.attribs.dir = resolveDirection(undefined, undefined, htmlTextSample(serialize(bodyPoint.children)))
  const { recordBody: _recordBody, recordTemplate: _recordTemplate, values: _values, ...bound } = section
  return { ...bound, html: serialize(document) } as BoundRecordSection<T>
}
