import { insideSideNote } from './composer-line-range.ts'
import type { MeasuredLineBox } from './composer-measure.ts'

export interface DescendantTableMeasurement {
  top: number
  bottom: number
  lines: MeasuredLineBox[]
}

export interface TableRowMeasurement {
  top: number
  bottom: number
  boxes: MeasuredLineBox[]
  tables?: DescendantTableMeasurement[]
}

export interface TableHeaderFact {
  top: number
  bottom: number
  height: number
  nesting: number
  parent?: number
}

export function lineWithinBox(line: MeasuredLineBox, box: Pick<MeasuredLineBox, 'top' | 'bottom'>): boolean {
  const middle = (line.top + line.bottom) / 2
  return middle >= box.top - 0.5 && middle <= box.bottom + 0.5
}

export function linesWithDescendantTables(rangeLines: readonly MeasuredLineBox[], tables: readonly DescendantTableMeasurement[]): MeasuredLineBox[] {
  const outsideTables = rangeLines.filter((line) => !tables.some((table) => lineWithinBox(line, table)))
  return [...outsideTables, ...tables.flatMap((table) => table.lines)].sort((left, right) => left.top - right.top)
}

export function tableRowLines(rows: readonly TableRowMeasurement[]): MeasuredLineBox[] {
  return rows.flatMap((row) => {
    const boxes = linesWithDescendantTables(row.boxes, row.tables ?? [])
    const groups: MeasuredLineBox[] = []
    for (const box of boxes) {
      const group = groups.at(-1)
      if (group && box.top < group.bottom && box.bottom > group.top) group.bottom = Math.max(group.bottom, box.bottom)
      else groups.push({ ...box })
    }
    if (groups.length === 0) return [{ top: row.top, bottom: row.bottom }]
    return groups.map((group, index) => ({
      top: index === 0 ? row.top : group.top,
      bottom: groups[index + 1]?.top ?? row.bottom,
    }))
  })
}

export function cellTextBoxes(cell: Element, table: Element, origin: number): MeasuredLineBox[] {
  const boxes: MeasuredLineBox[] = []
  const walker = table.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (!insideSideNote(node.parentElement) && node.parentElement?.closest('table') === table) {
      const range = table.ownerDocument.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) boxes.push({ top: rect.top - origin, bottom: rect.bottom - origin })
    }
    node = walker.nextNode()
  }
  return boxes
}

export function cellReplacedBoxes(cell: Element, table: Element, origin: number): MeasuredLineBox[] {
  const boxes: MeasuredLineBox[] = []
  for (const replaced of cell.querySelectorAll('img,svg,video,canvas,picture,iframe,object,embed,math')) {
    if (insideSideNote(replaced) || replaced.closest('table') !== table) continue
    const box = replaced.getBoundingClientRect()
    boxes.push({ top: box.top - origin, bottom: box.bottom - origin })
  }
  return boxes
}

export function cellTables(cell: Element, table: Element, origin: number): DescendantTableMeasurement[] {
  const tables: DescendantTableMeasurement[] = []
  for (const nested of cell.querySelectorAll('table')) {
    if (insideSideNote(nested) || nested.parentElement?.closest('table') !== table || !tableRenderedInFlow(nested)) continue
    const box = nested.getBoundingClientRect()
    tables.push({ top: box.top - origin, bottom: box.bottom - origin, lines: measureTableLines(nested, origin) })
  }
  return tables
}

export function measureTableRow(row: Element, table: Element, origin: number): TableRowMeasurement {
  const rowBox = row.getBoundingClientRect()
  const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td'))
  return {
    top: rowBox.top - origin,
    bottom: rowBox.bottom - origin,
    boxes: cells.flatMap((cell) => [...cellTextBoxes(cell, table, origin), ...cellReplacedBoxes(cell, table, origin)]),
    tables: cells.flatMap((cell) => cellTables(cell, table, origin)),
  }
}

export function measureTableLines(element: Element, origin: number): MeasuredLineBox[] {
  const tableBox = element.getBoundingClientRect()
  const rowElements = Array.from(element.querySelectorAll('tr')).filter((row) => row.closest('table') === element)
  const rows = rowElements.map((row) => measureTableRow(row, element, origin))
  const rowLines = rows.map((row) => tableRowLines([row]))
  const collapsed = getComputedStyle(element).borderCollapse === 'collapse'
  const collapsedBorderOutset = (row: Element | undefined, edge: 'Start' | 'End') => {
    if (!collapsed || !row) return 0
    const width = Math.max(
      0,
      ...Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) => Number.parseFloat(getComputedStyle(cell)[`borderBlock${edge}Width`]) || 0),
    )
    return width > 0 ? width + 0.5 : 0
  }
  for (let index = 1; index < rowLines.length; index++) {
    const previous = rowLines[index - 1]?.at(-1)
    const next = rowLines[index]?.[0]
    if (!previous || !next) continue
    const outset = Math.max(collapsedBorderOutset(rowElements[index - 1], 'End'), collapsedBorderOutset(rowElements[index], 'Start'))
    if (outset <= 0) continue
    previous.decorationBottom = Math.max(previous.decorationBottom ?? previous.bottom, previous.bottom + outset)
    next.top += outset
  }
  const lines = rowLines.flat()
  const first = lines[0]
  if (first) first.top = Math.min(first.top, tableBox.top - origin)
  const last = lines.at(-1)
  if (last) last.bottom = Math.max(last.bottom, tableBox.bottom - origin)
  return lines
}

export function tableRenderedInFlow(element: Element, styleOf: (element: Element) => CSSStyleDeclaration = getComputedStyle): boolean {
  const style = styleOf(element)
  return element.getClientRects().length > 0 && style.display !== 'none' && style.position !== 'absolute' && style.position !== 'fixed'
}

export function repeatedTableHeaderIndexes(tables: readonly TableHeaderFact[], start: number): number[] {
  return tables
    .map((table, index) => ({ table, index }))
    .filter(({ table }) => table.height > 0 && table.top < start && table.bottom > start)
    .sort((left, right) => left.table.nesting - right.table.nesting || left.index - right.index)
    .map(({ index }) => index)
}

export function repeatedTableHeaderHeight(tables: readonly TableHeaderFact[], start: number): number {
  return repeatedTableHeaderIndexes(tables, start).reduce((height, index) => height + (tables[index]?.height ?? 0), 0)
}

export function linesWithTableHeaderHeights(lines: readonly MeasuredLineBox[], tables: readonly TableHeaderFact[]): MeasuredLineBox[] {
  return lines.map((line) => {
    const headerHeight = repeatedTableHeaderHeight(tables, line.top)
    return headerHeight > 0 ? { ...line, headerHeight } : line
  })
}

export function headerTablesFor(
  element: Element,
  origin: number,
  styleOf: (element: Element) => CSSStyleDeclaration = getComputedStyle,
): { tables: Element[]; facts: TableHeaderFact[] } {
  const candidates = (element.tagName === 'TABLE' ? [element, ...element.querySelectorAll('table')] : Array.from(element.querySelectorAll('table'))).filter(
    (table) => tableRenderedInFlow(table, styleOf),
  )
  const facts = candidates.map((table) => {
    const box = table.getBoundingClientRect()
    const parentTable = table.parentElement?.closest('table')
    const parent = parentTable ? candidates.indexOf(parentTable) : -1
    let nesting = 0
    let ancestor = parent
    while (ancestor >= 0) {
      nesting += 1
      const next = candidates[ancestor]?.parentElement?.closest('table')
      ancestor = next ? candidates.indexOf(next) : -1
    }
    return {
      top: box.top - origin,
      bottom: box.bottom - origin,
      height: (table as HTMLTableElement).tHead?.getBoundingClientRect().height ?? 0,
      nesting,
      ...(parent >= 0 ? { parent } : {}),
    }
  })
  return { tables: candidates, facts }
}
