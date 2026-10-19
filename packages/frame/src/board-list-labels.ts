export interface BoardListLabels {
  search: string
  searchPlaceholder: string
  noMatches: string
  untitled: (kind: string) => string
}

export const ENGLISH_BOARD_LIST_LABELS: BoardListLabels = {
  search: 'Search board items',
  searchPlaceholder: 'Search',
  noMatches: 'No matching items',
  untitled: (kind) => `Untitled ${kind}`,
}

export function boardListLabels(labels: Partial<BoardListLabels>): BoardListLabels {
  return { ...ENGLISH_BOARD_LIST_LABELS, ...labels }
}
