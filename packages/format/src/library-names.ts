import type { z } from 'zod'

const LIBRARY_DEFAULTS = Symbol.for('segnavia.library-defaults')

export function hasLibraryDefaults(entries: readonly { name: string }[]): boolean {
  return LIBRARY_DEFAULTS in entries || entries.some((entry) => LIBRARY_DEFAULTS in entry)
}

export function libraryNameIssue(kind: string, name: string): string | undefined {
  return name.startsWith('segnavia:')
    ? `${kind} name ${JSON.stringify(name)} is reserved for the library; rename it without the segnavia: prefix to clear this refusal`
    : undefined
}

export function refineLibraryNames(kind: string, entries: readonly { name: string }[], ctx: z.RefinementCtx): void {
  if (hasLibraryDefaults(entries)) return
  entries.forEach((entry, index) => {
    const message = libraryNameIssue(kind, entry.name)
    if (message) ctx.addIssue({ code: 'custom', path: [index, 'name'], message })
  })
}

export function withLibraryDefaults<T extends { name: string }>(library: readonly T[], declared: readonly T[]): T[] {
  if (hasLibraryDefaults(declared)) return declared as T[]
  for (const entry of library) Object.defineProperty(entry, LIBRARY_DEFAULTS, { value: true, enumerable: true })
  const entries = [...library, ...declared]
  Object.defineProperty(entries, LIBRARY_DEFAULTS, { value: true })
  return entries
}
