import { expect, test } from 'bun:test'
import { Text } from 'domhandler'
import { ReportCollector } from './report.ts'
import { StyleMapper } from './styles.ts'
import { tableHtml } from './table-html.ts'
import { TableStyleMapper } from './table-styles.ts'
import type { IdmlStyle, IdmlTextNode } from './types.ts'

const node = (name: string, attributes: Record<string, string>, children: IdmlTextNode[] = []): IdmlTextNode => ({
  name, attributes, children, location: `Story.xml#${name}-${attributes.Name ?? ''}`,
})

test('writes a native table with dimensions, regions, spans, td headers and classes', () => {
  const styles: IdmlStyle[] = [
    { id: 't', name: 'Ledger', kind: 'table', properties: { HeaderRegionCellStyle: 'header' }, location: 'Styles#t' },
    { id: 'header', name: 'Header', kind: 'cell', properties: {}, location: 'Styles#header' },
    { id: 'body', name: 'Body', kind: 'cell', properties: {}, location: 'Styles#body' },
  ]
  const report = new ReportCollector()
  const textStyles = new StyleMapper(styles, [], report, 'rtl')
  const tableStyles = new TableStyleMapper(styles, [], report, (css) => textStyles.cssOverrideClass(css))
  const table = node('Table', { AppliedTableStyle: 't', HeaderRowCount: '1', BodyRowCount: '1', FooterRowCount: '1', TableDirection: 'RightToLeft' }, [
    node('Column', { SingleColumnWidth: '30' }), node('Column', { SingleColumnWidth: '40' }),
    node('Cell', { Name: '0:0', ColumnSpan: '2' }), node('Cell', { Name: '0:1', AppliedCellStyle: 'body' }),
    node('Cell', { Name: '1:1', RowSpan: '2' }), node('Cell', { Name: '0:2' }),
    node('Row', { SingleRowHeight: '10', AutoGrow: 'false' }), node('Row', {}), node('Row', {}),
  ])
  const html = tableHtml(table, tableStyles, (cell) => [new Text(cell.attributes.Name ?? '')])
  expect(html).toBe(
    '<table class="idml-t-ledger" dir="rtl"><colgroup><col style="width:30pt"><col style="width:40pt"></colgroup><thead><tr style="height:10pt"><td colspan="2" class="idml-cell-header">0:0</td></tr></thead><tbody><tr><td class="idml-cell-body">0:1</td><td rowspan="2">1:1</td></tr></tbody><tfoot><tr><td>0:2</td></tr></tfoot></table>',
  )
  expect(html).not.toContain('<th ')
})
