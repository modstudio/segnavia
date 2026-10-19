import { describe, expect, test } from 'bun:test'
import type { Board } from './board.ts'
import { boardListing, boardListingIsEmpty, foldForSearch } from './board-listing.ts'

const item = (id: string): Board['items'][number] => ({ id, kind: 'page', address: id, x: 0, y: 0, width: 100 })
const itemA = item('a')
const itemB = item('b')
const itemC = item('c')
const firstSection: Board['sections'][number] = {
  id: 'first',
  title: 'First',
  rectangle: { x: 0, y: 0, width: 1, height: 1 },
  items: ['b', 'a'],
}
const board: Board = {
  title: 'List',
  direction: 'ltr',
  labels: [],
  items: [itemA, itemB, itemC],
  sections: [firstSection, { id: 'second', title: 'Second', rectangle: { x: 0, y: 0, width: 1, height: 1 }, items: ['a'] }],
}
const names: Record<string, string> = { a: 'Alpha', b: 'Beta', c: 'Gamma' }

describe('board listing', () => {
  test('folds niqqud, final letters, Latin accents, case and whitespace', () => {
    expect(foldForSearch('  שָׁלוֹם  מֶלֶך  CAFÉ\n')).toBe('שלומ מלכ cafe')
  })
  test('keeps section and member order and claims duplicate members only once', () => {
    const groups = boardListing(board, (entry) => names[entry.id] ?? '', '')
    expect(
      groups.map((group) =>
        group.kind === 'section' ? [group.section.id, ...group.items.map((entry) => entry.id)] : ['loose', ...group.items.map((entry) => entry.id)],
      ),
    ).toEqual([['first', 'b', 'a'], ['second'], ['loose', 'c']])
  })
  test('puts loose items last and omits the group when empty', () => {
    expect(
      boardListing({ ...board, sections: [{ ...firstSection, items: ['a', 'b', 'c'] }] }, (entry) => names[entry.id] ?? '', '').map((group) => group.kind),
    ).toEqual(['section'])
  })
  test('a matching section title keeps all members', () => {
    expect(boardListing(board, (entry) => names[entry.id] ?? '', 'first')[0]?.items.map((entry) => entry.id)).toEqual(['b', 'a'])
  })
  test('a content match keeps a name mismatch', () => {
    expect(boardListing(board, (entry) => names[entry.id] ?? '', 'missing', ['c'])).toEqual([{ kind: 'loose', items: [itemC] }])
  })
  test('empty sections appear only for an empty query', () => {
    const empty = { ...board, items: [], sections: [{ ...firstSection, items: [] }] }
    expect(boardListing(empty, () => '', '')).toHaveLength(1)
    expect(boardListing(empty, () => '', 'x')).toHaveLength(0)
  })
  test('shows the empty state only when a non-empty query has no groups', () => {
    expect(boardListingIsEmpty('', [])).toBe(false)
    expect(boardListingIsEmpty('  ', [])).toBe(false)
    expect(boardListingIsEmpty('missing', [])).toBe(true)
    expect(boardListingIsEmpty('match', [{ kind: 'loose', items: [itemA] }])).toBe(false)
  })
})
