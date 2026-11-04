import type { Board, BoardSection } from './board.ts'
import { itemRectangle, labelRectangle } from './board-geometry.ts'
import { layoutSection } from './board-section-grid.ts'
import { overlaps } from './board-sections.ts'
import type { ComputedBoardShapes } from './board-shapes.ts'
import type { Box } from './deck.ts'
import type { AssetKind } from './placement.ts'

export type BoardDescriptionEntityKind = 'item' | 'label' | 'section'

export interface BoardDescriptionEntity {
  kind: BoardDescriptionEntityKind
  id: string
}

export interface BoardDescriptionCell {
  row: number
  column: number
}

export interface BoardDescriptionMember {
  id: string
  address: string
  kind: AssetKind
  cell?: BoardDescriptionCell
}

export interface BoardDescriptionSection {
  id: string
  title: string
  layout: 'auto' | 'manual'
  box?: Box
  members: BoardDescriptionMember[]
}

export interface BoardDescriptionItem {
  id: string
  address: string
  kind: AssetKind
  box?: Box
}

export interface BoardDescriptionLabel {
  id: string
  text: string
  box?: Box
}

export interface BoardDescriptionOverlap {
  a: BoardDescriptionEntity
  b: BoardDescriptionEntity
}

export interface BoardDescription {
  title: string
  direction: Board['direction']
  sections: BoardDescriptionSection[]
  items: BoardDescriptionItem[]
  labels: BoardDescriptionLabel[]
  /** May name an entity outside the returned arrays when it overlaps a selected entity. */
  overlaps: BoardDescriptionOverlap[]
  provisional: string[]
  estimated: string[]
  next?: string
}

export interface DescribeBoardOptions {
  section?: string
  region?: Box
  detail?: 'concise' | 'full'
  cursor?: string
  limit?: number
}

interface FullSection extends Omit<BoardDescriptionSection, 'box'> {
  box: Box
}

interface FullItem extends Omit<BoardDescriptionItem, 'box'> {
  box: Box
}

interface FullLabel extends Omit<BoardDescriptionLabel, 'box'> {
  box: Box
}

type PageEntity =
  | { kind: 'section'; value: FullSection; geometry: GeometryEntity[] }
  | { kind: 'item'; value: FullItem; geometry: [GeometryEntity] }
  | { kind: 'label'; value: FullLabel; geometry: [GeometryEntity] }

interface GeometryEntity extends BoardDescriptionEntity {
  box: Box
  memberOf?: string
}

function sectionMembers(board: Board, shapes: ComputedBoardShapes, section: BoardSection): BoardDescriptionMember[] {
  const laidOut = section.layout === 'manual' ? section : layoutSection(board, shapes.shapes, section.id).sections.find((entry) => entry.id === section.id)
  const cells = new Map(laidOut?.cells?.map((cell) => [cell.id, cell]))
  return section.items.map((id) => {
    const item = board.items.find((entry) => entry.id === id)
    if (!item) throw new Error(`section "${section.id}" member "${id}" is not a board item; provide a valid Board`)
    const cell = cells.get(id)
    return {
      id: item.id,
      address: item.address,
      kind: item.kind,
      ...(cell ? { cell: { row: cell.row, column: cell.column } } : {}),
    }
  })
}

function fullEntities(board: Board, shapes: ComputedBoardShapes): PageEntity[] {
  const memberIds = new Set(board.sections.flatMap((section) => section.items))
  const sections: PageEntity[] = board.sections.map((section) => {
    const members = sectionMembers(board, shapes, section)
    const sectionGeometry: GeometryEntity = { kind: 'section', id: section.id, box: section.rectangle }
    const geometry: GeometryEntity[] = [
      sectionGeometry,
      ...members.map((member): GeometryEntity => {
        const item = board.items.find((entry) => entry.id === member.id)
        if (!item) throw new Error(`section "${section.id}" member "${member.id}" is not a board item; provide a valid Board`)
        return { kind: 'item', id: member.id, box: itemRectangle(item, shapes.shapes), memberOf: section.id }
      }),
    ]
    return {
      kind: 'section',
      value: { id: section.id, title: section.title, layout: section.layout ?? 'auto', box: sectionGeometry.box, members },
      geometry,
    }
  })
  const items: PageEntity[] = board.items
    .filter((item) => !memberIds.has(item.id))
    .map((item) => {
      const geometry: GeometryEntity = { kind: 'item', id: item.id, box: itemRectangle(item, shapes.shapes) }
      return {
        kind: 'item',
        value: { id: item.id, address: item.address, kind: item.kind, box: geometry.box },
        geometry: [geometry],
      }
    })
  const labels: PageEntity[] = board.labels.map((label) => {
    const geometry: GeometryEntity = { kind: 'label', id: label.id, box: labelRectangle(label, shapes.shapes) }
    return {
      kind: 'label',
      value: { id: label.id, text: label.text, box: geometry.box },
      geometry: [geometry],
    }
  })
  return [...sections, ...items, ...labels]
}

function resolveSection(board: Board, name: string): BoardSection {
  const byId = board.sections.find((section) => section.id === name)
  if (byId) return byId
  const byTitle = board.sections.filter((section) => section.title === name)
  if (byTitle.length === 1 && byTitle[0]) return byTitle[0]
  if (byTitle.length > 1) {
    throw new Error(`section "${name}" could not be established because its title is repeated; use the section id to clear this ambiguity`)
  }
  throw new Error(`section "${name}" could not be established by id or title; use an existing section id or unique title`)
}

function pageStart(cursor: string | undefined, length: number): number {
  if (cursor === undefined) return 0
  if (!/^(0|[1-9]\d*)$/.test(cursor)) throw new Error(`board description cursor "${cursor}" is malformed; use a cursor returned by describeBoard`)
  const start = Number(cursor)
  if (!Number.isSafeInteger(start) || start > length) {
    throw new Error(`board description cursor "${cursor}" is outside this result; begin again without a cursor`)
  }
  return start
}

function pageLimit(limit: number | undefined): number {
  const value = limit ?? 200
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`board description limit is ${value}; provide a positive integer`)
  return value
}

function intersectingPairs(entities: readonly GeometryEntity[]): BoardDescriptionOverlap[] {
  const result: BoardDescriptionOverlap[] = []
  for (let a = 0; a < entities.length; a += 1) {
    const first = entities[a]
    if (!first) continue
    for (let b = a + 1; b < entities.length; b += 1) {
      const second = entities[b]
      if (!second || (first.kind === 'section' && second.memberOf === first.id) || (second.kind === 'section' && first.memberOf === second.id)) continue
      if (overlaps(first.box, second.box)) result.push({ a: { kind: first.kind, id: first.id }, b: { kind: second.kind, id: second.id } })
    }
  }
  return result
}

function conciseSection(section: FullSection): BoardDescriptionSection {
  const { box: _box, ...value } = section
  return value
}

function conciseItem(item: FullItem): BoardDescriptionItem {
  const { box: _box, ...value } = item
  return value
}

function conciseLabel(label: FullLabel): BoardDescriptionLabel {
  const { box: _box, ...value } = label
  return value
}

export function describeBoard(board: Board, shapes: ComputedBoardShapes, options: DescribeBoardOptions = {}): BoardDescription {
  const all = fullEntities(board, shapes)
  const section = options.section === undefined ? undefined : resolveSection(board, options.section)
  const filtered = all.filter((entity) => {
    if (section && (entity.kind !== 'section' || entity.value.id !== section.id)) return false
    return !options.region || overlaps(entity.value.box, options.region)
  })
  const start = pageStart(options.cursor, filtered.length)
  const limit = pageLimit(options.limit)
  const page = filtered.slice(start, start + limit)
  const allGeometry = all.flatMap((entity) => entity.geometry)
  const pageGeometry = page.flatMap((entity) => entity.geometry)
  const selectedGeometry = filtered.flatMap((entity) => entity.geometry)
  const selectedIds = new Set(selectedGeometry.map((entity) => entity.id))
  const pageIds = new Set(pageGeometry.map((entity) => entity.id))
  const owners = new Map(filtered.flatMap((entity, index) => entity.geometry.map((geometryEntity) => [geometryEntity.id, index] as const)))
  const pairs = intersectingPairs(allGeometry).filter((pair) => {
    if (!selectedIds.has(pair.a.id) && !selectedIds.has(pair.b.id)) return false
    const owner = Math.min(owners.get(pair.a.id) ?? Number.POSITIVE_INFINITY, owners.get(pair.b.id) ?? Number.POSITIVE_INFINITY)
    return owner >= start && owner < start + page.length
  })
  const full = options.detail === 'full'
  const next = start + page.length < filtered.length ? String(start + page.length) : undefined
  return {
    title: board.title,
    direction: board.direction,
    sections: page
      .filter((entity): entity is Extract<PageEntity, { kind: 'section' }> => entity.kind === 'section')
      .map((entity) => (full ? entity.value : conciseSection(entity.value))),
    items: page
      .filter((entity): entity is Extract<PageEntity, { kind: 'item' }> => entity.kind === 'item')
      .map((entity) => (full ? entity.value : conciseItem(entity.value))),
    labels: page
      .filter((entity): entity is Extract<PageEntity, { kind: 'label' }> => entity.kind === 'label')
      .map((entity) => (full ? entity.value : conciseLabel(entity.value))),
    overlaps: pairs,
    provisional: shapes.provisional.filter((id) => pageIds.has(id)),
    estimated: shapes.estimated.filter((id) => pageIds.has(id)),
    ...(next ? { next } : {}),
  }
}
