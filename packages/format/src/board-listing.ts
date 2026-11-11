import type { Board, BoardItem, BoardSection } from './board.ts'

export type BoardListingGroup = { kind: 'section'; section: BoardSection; items: BoardItem[] } | { kind: 'loose'; items: BoardItem[] }
export type BoardSectionGroup = BoardListingGroup

const FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ךםןףץ]/g, (letter) => FINAL_LETTERS[letter] ?? letter)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export function nameMatches(name: string, query: string): boolean {
  return foldForSearch(name).includes(foldForSearch(query))
}

export function boardListingIsEmpty(query: string, groups: BoardListingGroup[]): boolean {
  return foldForSearch(query).length > 0 && groups.length === 0
}

/** Every section with the items it first claims, followed by the loose items. */
export function boardSectionGroups(board: Board): BoardSectionGroup[] {
  const byId = new Map(board.items.map((item) => [item.id, item]))
  const claimed = new Set<string>()
  const sections = board.sections.map(
    (section): BoardSectionGroup => ({
      kind: 'section',
      section,
      items: section.items.flatMap((id) => {
        const item = byId.get(id)
        if (!item || claimed.has(id)) return []
        claimed.add(id)
        return [item]
      }),
    }),
  )
  return [...sections, { kind: 'loose', items: board.items.filter((item) => !claimed.has(item.id)) }]
}

export function boardListing(board: Board, nameOf: (item: BoardItem) => string, query: string, contentMatches: Iterable<string> = []): BoardListingGroup[] {
  const folded = foldForSearch(query)
  const content = new Set(contentMatches)
  const groups: BoardListingGroup[] = []

  for (const group of boardSectionGroups(board)) {
    const visible = folded ? group.items.filter((item) => nameMatches(nameOf(item), folded) || content.has(item.id)) : group.items
    if (group.kind === 'section') {
      const items = !folded || nameMatches(group.section.title, folded) ? group.items : visible
      if (!folded || items.length > 0) groups.push({ ...group, items })
    } else if (visible.length > 0) groups.push({ kind: 'loose', items: visible })
  }
  return groups
}
