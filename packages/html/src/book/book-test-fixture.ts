import { Book, type Book as BookValue } from '@segnavia/format'

type Input = Record<string, unknown>

function identify(entry: unknown, newId: () => string): unknown {
  if (typeof entry !== 'object' || entry === null) return entry
  const value = entry as Input
  const id = value.id ?? newId()
  const children = Array.isArray(value.children) ? value.children.map((child) => identify(child, newId)) : value.children
  return { ...value, id, ...(children === undefined ? {} : { children }) }
}

export function parseBookFixture(input: unknown, newId: () => string = (() => {
  let id = 0
  return () => `section-${++id}`
})()): BookValue {
  const value = input as Input
  const identified = { ...value }
  for (const key of ['frontMatter', 'body', 'chapters', 'endMatter']) {
    const field = value[key]
    if (Array.isArray(field)) identified[key] = field.map((entry) => identify(entry, newId))
  }
  return Book.parse(identified)
}
