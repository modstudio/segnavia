import type { Board, BoardItem, BoardSection } from './board.ts'

export type BoardListingGroup = { kind: 'section'; section: BoardSection; items: BoardItem[] } | { kind: 'loose'; items: BoardItem[] }

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

export function boardListing(board: Board, nameOf: (item: BoardItem) => string, query: string, contentMatches: Iterable<string> = []): BoardListingGroup[] {
  const folded = foldForSearch(query)
  const byId = new Map(board.items.map((item) => [item.id, item]))
  const content = new Set(contentMatches)
  const claimed = new Set<string>()
  const groups: BoardListingGroup[] = []

  for (const section of board.sections) {
    const members = section.items.flatMap((id) => {
      if (claimed.has(id)) return []
      claimed.add(id)
      const item = byId.get(id)
      return item ? [item] : []
    })
    const items = !folded || nameMatches(section.title, folded) ? members : members.filter((item) => nameMatches(nameOf(item), folded) || content.has(item.id))
    if (!folded || items.length > 0) groups.push({ kind: 'section', section, items })
  }

  const loose = board.items.filter((item) => !claimed.has(item.id))
  const visibleLoose = folded ? loose.filter((item) => nameMatches(nameOf(item), folded) || content.has(item.id)) : loose
  if (visibleLoose.length > 0) groups.push({ kind: 'loose', items: visibleLoose })
  return groups
}
