import type { z } from 'zod'

export function libraryNameIssue(kind: string, name: string): string | undefined {
  return name.startsWith('segnavia:')
    ? `${kind} name ${JSON.stringify(name)} is reserved for the library; rename it without the segnavia: prefix to clear this refusal`
    : undefined
}

export function refineLibraryNames(kind: string, entries: readonly { name: string }[], ctx: z.RefinementCtx): void {
  entries.forEach((entry, index) => {
    const message = libraryNameIssue(kind, entry.name)
    if (message) ctx.addIssue({ code: 'custom', path: [index, 'name'], message })
  })
}

export function withLibraryDefaults<T extends { name: string }>(library: readonly T[], declared: readonly T[]): T[] {
  return [...library, ...declared]
}
