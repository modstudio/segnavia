type Refuse = (reason: string) => never

export function predecessor<T>(entries: readonly T[], id: string, identify: (entry: T) => string): string | null {
  const at = entries.findIndex((entry) => identify(entry) === id)
  return at <= 0 ? null : identify(entries[at - 1] as T)
}

export function insertAfter<T>(entries: readonly T[], entry: T, after: string | null, identify: (entry: T) => string, refuse: Refuse): T[] {
  const at = after === null ? 0 : entries.findIndex((candidate) => identify(candidate) === after) + 1
  if (after !== null && at === 0) refuse(`anchor "${after}" is missing`)
  return [...entries.slice(0, at), entry, ...entries.slice(at)]
}
