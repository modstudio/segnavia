import serialize from 'dom-serializer'
import { Element, type Text } from 'domhandler'
import { tableGrid, type TableRegion } from './table-model.ts'
import type { TableStyleMapper } from './table-styles.ts'
import type { IdmlTextNode } from './types.ts'

export type TableCellContent = (cell: IdmlTextNode) => (Element | Text)[]

function regionElement(region: TableRegion): 'thead' | 'tbody' | 'tfoot' {
  return region === 'header' ? 'thead' : region === 'footer' ? 'tfoot' : 'tbody'
}

export function tableNode(node: IdmlTextNode, styles: TableStyleMapper, content: TableCellContent): Element {
  const grid = tableGrid(node)
  const tableStyle = node.attributes.AppliedTableStyle
  const className = styles.tableClass(tableStyle)
  const columns = new Element(
    'colgroup',
    {},
    grid.columns.map((width) => new Element('col', { style: `width:${width}pt` }, [])),
  )
  const groups: Element[] = []
  let currentRegion: TableRegion | undefined
  let currentRows: Element[] = []
  const flush = () => {
    if (currentRegion && currentRows.length > 0) groups.push(new Element(regionElement(currentRegion), {}, currentRows))
    currentRows = []
  }
  for (const [rowIndex, row] of grid.rows.entries()) {
    if (row.region !== currentRegion) {
      flush()
      currentRegion = row.region
    }
    const cells = grid.cells.filter((cell) => cell.row === rowIndex)
    currentRows.push(
      new Element(
        'tr',
        row.fixed && row.height !== undefined ? { style: `height:${row.height}pt` } : {},
        cells.map((cell) => {
          const classes = styles.cellClasses({
            tableStyle,
            region: row.region,
            column: cell.column,
            columnCount: grid.columns.length,
            node: cell.node,
            direction: grid.direction,
          })
          return new Element(
            'td',
            {
              ...(cell.rowSpan > 1 ? { rowspan: String(cell.rowSpan) } : {}),
              ...(cell.columnSpan > 1 ? { colspan: String(cell.columnSpan) } : {}),
              ...(classes.length > 0 ? { class: classes.join(' ') } : {}),
            },
            content(cell.node),
          )
        }),
      ),
    )
  }
  flush()
  return new Element('table', { ...(className ? { class: className } : {}), dir: grid.direction }, [columns, ...groups])
}

export function tableHtml(node: IdmlTextNode, styles: TableStyleMapper, content: TableCellContent): string {
  return serialize(tableNode(node, styles, content), { xmlMode: false, encodeEntities: 'utf8' })
}
