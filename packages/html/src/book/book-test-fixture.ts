import { Book, type Book as BookValue } from '@segnavia/format'
import { parseDocument } from '../document.ts'

type Input = Record<string, unknown>

function identify(entry: unknown, newId: () => string): unknown {
  if (typeof entry !== 'object' || entry === null) return entry
  const value = entry as Input
  const id = value.id ?? newId()
  const children = Array.isArray(value.children) ? value.children.map((child) => identify(child, newId)) : value.children
  return { ...value, id, ...(children === undefined ? {} : { children }) }
}

function identifyContent(entry: unknown, newId: () => string): unknown {
  if (Array.isArray(entry)) return entry.map((value) => identifyContent(value, newId))
  if (typeof entry !== 'object' || entry === null) return entry
  const value = entry as Input
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => {
      if (key === 'html' && typeof field === 'string') {
        const document = parseDocument({ type: 'document', kind: 'page', children: [{ type: 'page', body: { html: field } }] }, { newId })
        const page = document.children[0]
        return [key, page?.type === 'page' && page.body && 'html' in page.body ? page.body.html : field]
      }
      if (key === 'regions' && typeof field === 'object' && field !== null && !Array.isArray(field)) {
        return [key, Object.fromEntries(Object.entries(field as Input).map(([name, html]) => [name, (identifyContent({ html }, newId) as Input).html]))]
      }
      return [key, identifyContent(field, newId)]
    }),
  )
}

export function parseBookFixture(
  input: unknown,
  newId: () => string = (() => {
    let id = 0
    return () => `section-${++id}`
  })(),
): BookValue {
  const value = input as Input
  const identified = { ...value }
  for (const key of ['frontMatter', 'body', 'chapters', 'endMatter']) {
    const field = value[key]
    if (Array.isArray(field)) identified[key] = field.map((entry) => identify(entry, newId))
  }
  return Book.parse(identifyContent(identified, newId))
}
