import type { SlotDeclaration } from '@segnavia/format'
import { Text } from 'domhandler'
import { elements, parse, serialize } from './sanitize.ts'

export interface RecordValueSection {
  html: string
  values?: Record<string, string>
  recordTemplate?: { name: string; slots: readonly Pick<SlotDeclaration, 'key'>[] }
}

export type BoundRecordSection<T extends RecordValueSection> = Omit<T, 'values'> & { values?: never }

export function bindRecordValues<T extends RecordValueSection>(section: T): BoundRecordSection<T> {
  if (!section.values || !section.recordTemplate) return section as BoundRecordSection<T>
  const document = parse(section.html)
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
  const { values: _values, ...bound } = section
  return { ...bound, html: serialize(document) } as BoundRecordSection<T>
}
