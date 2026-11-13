import type { z } from 'zod'

export function libraryNameIssue(kind: string, name: string): string | undefined {
  return name.startsWith('segnavia:')
    ? `${kind} name ${JSON.stringify(name)} is reserved for the library; rename it without the segnavia: prefix to clear this refusal`
    : undefined
}

export function refineLibraryNames(kind: string, entries: readonly { name: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    const message = libraryNameIssue(kind, entry.name)
    if (message) ctx.addIssue({ code: 'custom', path: [index, 'name'], message })
    if (seen.has(entry.name)) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'name'],
        message: `${kind} name ${JSON.stringify(entry.name)} is declared more than once; keep one declaration or rename one to clear this refusal`,
      })
    }
    seen.add(entry.name)
  })
}

export function withLibraryEntries<Library extends { name: string }, Declared extends { name: string }>(
  library: readonly Library[],
  declared?: readonly Declared[],
): Array<Library | Declared> {
  const authored = declared ?? []
  const names = new Set(authored.map((entry) => entry.name))
  return [...library.filter((entry) => !names.has(entry.name)), ...authored]
}
