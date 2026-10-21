import type { Page } from '@segnavia/format'

export interface MovePageInput {
  pageId: string
  fromIndex: number
  toIndex: number
}

export type MovePageHandler = (input: MovePageInput) => Promise<void>

export function pageIdentityError(pages: readonly Page[]): string | null {
  const ids = new Set<string>()
  for (const [index, page] of pages.entries()) {
    if (page.id === undefined) return `Page ${index + 1} has no id. Give every page a unique id to reorder this document.`
    if (ids.has(page.id)) return `Page id "${page.id}" is repeated. Give every page a unique id to reorder this document.`
    ids.add(page.id)
  }
  return null
}

export function reorderPages(pages: readonly Page[], fromIndex: number, toIndex: number): Page[] {
  if (fromIndex < 0 || fromIndex >= pages.length) throw new RangeError(`Page ${fromIndex + 1} is outside the document.`)
  if (toIndex < 0 || toIndex >= pages.length) throw new RangeError(`Page ${toIndex + 1} is outside the document.`)
  const reordered = [...pages]
  const [page] = reordered.splice(fromIndex, 1)
  reordered.splice(toIndex, 0, page as Page)
  return reordered
}

export async function movePageOptimistically(
  pages: readonly Page[],
  fromIndex: number,
  toIndex: number,
  show: (pages: Page[]) => void,
  current: () => readonly Page[],
  save: MovePageHandler,
): Promise<void> {
  if (fromIndex === toIndex) return
  const invalid = pageIdentityError(pages)
  if (invalid) throw new RangeError(invalid)
  const page = pages[fromIndex] as Page & { id: string }
  const next = reorderPages(pages, fromIndex, toIndex)
  show(next)
  const optimistic = current()
  try {
    await save({ pageId: page.id, fromIndex, toIndex })
  } catch (error) {
    if (current() === optimistic) show([...pages])
    throw error
  }
}
