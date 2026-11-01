import { expect, test } from 'bun:test'
import { ReportCollector } from './report.ts'
import { StyleMapper } from './styles.ts'
import { TableStyleMapper } from './table-styles.ts'
import type { IdmlStyle, IdmlTextNode } from './types.ts'

const style = (id: string, name: string, kind: 'table' | 'cell', properties: Record<string, string>, basedOn?: string): IdmlStyle => ({
  id, name, kind, properties, ...(basedOn ? { basedOn } : {}), location: `Resources/Styles.xml#${id}`,
})
const cell = (attributes: Record<string, string>, location = 'Stories/Story.xml#cell'): IdmlTextNode => ({
  name: 'Cell', attributes, children: [], location,
})

test('writes table and layered region and cell classes in source order', () => {
  const styles = [
    style('table', 'Ledger', 'table', { BodyRegionCellStyle: 'region', SpaceBefore: '4', SpaceAfter: '6' }),
    style('region', 'Body region', 'cell', { FillColor: 'Color/Black', TopInset: '2' }),
    style('own', 'Emphasis', 'cell', { FillColor: 'Color/Paper', VerticalJustification: 'BottomAlign' }, 'region'),
  ]
  const text = new StyleMapper(styles, [], new ReportCollector(), 'ltr')
  const tables = new TableStyleMapper(styles, [], new ReportCollector(), (css) => text.cssOverrideClass(css))
  expect(tables.tableClass('table')).toBe('idml-t-ledger')
  expect(tables.cellClasses({ tableStyle: 'table', region: 'body', column: 0, columnCount: 2, node: cell({ AppliedCellStyle: 'own', TopInset: '3' }), direction: 'ltr' })).toEqual([
    'idml-cell-body-region', 'idml-cell-emphasis', 'idml-o-1',
  ])
  const css = tables.css() + text.css()
  expect(css).toContain('.idml-t-ledger{border-collapse:collapse;margin-block-start:4pt;margin-block-end:6pt}')
  expect(css.indexOf('.idml-cell-body-region{')).toBeLessThan(css.indexOf('.idml-cell-emphasis{'))
  expect(css).toContain('background-color:#fff;vertical-align:bottom')
  expect(css).toContain('.idml-o-1{padding-block-start:3pt}')
})

test('maps logical strokes, tint, insets and reports unsupported stroke and vertical justification', () => {
  const report = new ReportCollector()
  const styles = [style('cell', 'Mapped', 'cell', {
    TopEdgeStrokeWeight: '1', TopEdgeStrokeType: 'Dashed', TopEdgeStrokeColor: 'Color/Black',
    LeftEdgeStrokeWeight: '2', LeftEdgeStrokeType: 'Fancy', FillColor: 'brand', FillTint: '50',
    LeftInset: '3', RightInset: '4', VerticalJustification: 'JustifyAlign',
  })]
  const mapper = new TableStyleMapper(styles, [{ id: 'brand', name: 'Brand', model: 'rgb', values: [100, 120, 140] }], report, () => undefined)
  mapper.cellClasses({ region: 'body', column: 0, columnCount: 1, node: cell({ AppliedCellStyle: 'cell' }), direction: 'rtl' })
  const css = mapper.css()
  expect(css).toContain('border-block-start-width:1pt;border-block-start-style:dashed;border-block-start-color:#000')
  expect(css).toContain('border-inline-start-width:2pt')
  expect(css).toContain('padding-inline-start:3pt;padding-inline-end:4pt')
  expect(css).toContain('background-color:color-mix(in srgb, rgb(100 120 140) 50%, #fff)')
  expect(report.data().unsupportedElements).toMatchObject({ 'Table:StrokeType:Fancy': 1, 'Table:VerticalJustify': 1 })
})

test('emits alternating fill rules with skip counts and deduplicates local overrides', () => {
  const text = new StyleMapper([], [], new ReportCollector(), 'ltr')
  const styles = [style('table', 'Bands', 'table', {
    AlternatingFills: 'AlternatingRows', StartRowFillColor: 'Color/Black', StartRowFillCount: '2', EndRowFillColor: 'Color/Paper',
    EndRowFillCount: '1', SkipFirstAlternatingFillRows: '1',
  })]
  const mapper = new TableStyleMapper(styles, [], new ReportCollector(), (css) => text.cssOverrideClass(css))
  mapper.tableClass('table')
  const input = { tableStyle: 'table', region: 'body' as const, column: 0, columnCount: 1, direction: 'ltr' as const }
  expect(mapper.cellClasses({ ...input, node: cell({ TopInset: '2' }, 'one') }).at(-1)).toBe('idml-o-1')
  expect(mapper.cellClasses({ ...input, node: cell({ TopInset: '2' }, 'two') }).at(-1)).toBe('idml-o-1')
  expect(mapper.css()).toContain('.idml-t-bands tr:nth-child(3n+2){background-color:#000}')
  expect(mapper.css()).toContain('.idml-t-bands tr:nth-child(3n+4){background-color:#fff}')
})

test('reports graphic, rotated and diagonal cells by their table feature names', () => {
  const report = new ReportCollector()
  const mapper = new TableStyleMapper([], [], report, () => undefined)
  mapper.cellClasses({
    region: 'body', column: 0, columnCount: 1, direction: 'ltr',
    node: cell({ CellType: 'GraphicTypeCell', TextRotation: '90', TopLeftDiagonalLine: 'true' }),
  })
  expect(report.data().unsupportedElements).toEqual({
    'Table:DiagonalLine': 1,
    'Table:GraphicCell': 1,
    'Table:RotatedCell': 1,
  })
})
