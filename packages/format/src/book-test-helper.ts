type Input = Record<string, unknown>

function identify(entry: unknown, next: () => string): unknown {
  if (typeof entry !== 'object' || entry === null) return entry
  const value = entry as Input
  const children = Array.isArray(value.children) ? value.children.map((child) => identify(child, next)) : value.children
  return { ...value, id: value.id ?? next(), ...(children === undefined ? {} : { children }) }
}

export function identifiedBookInput(input: unknown): unknown {
  let id = 0
  const next = () => `book-test-${++id}`
  const value = input as Input
  const identified = { ...value }
  for (const key of ['frontMatter', 'body', 'chapters', 'endMatter']) {
    const field = value[key]
    if (Array.isArray(field)) identified[key] = field.map((entry) => identify(entry, next))
  }
  return identified
}
