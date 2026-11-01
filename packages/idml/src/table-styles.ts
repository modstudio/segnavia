import type { ReportCollector } from './report.ts'
import { reportableStyleProperties } from './style-property-report.ts'
import { resolveSwatchColor } from './swatch-color.ts'
import { flattenedStyle, styleChain } from './styles.ts'
import type { IdmlStyle, IdmlSwatch, IdmlTextNode } from './types.ts'

const TABLE_HANDLED = new Set([
  'SpaceBefore', 'SpaceAfter', 'HeaderRegionCellStyle', 'BodyRegionCellStyle', 'FooterRegionCellStyle', 'LeftColumnRegionCellStyle',
  'RightColumnRegionCellStyle', 'AlternatingFills', 'StartRowFillColor', 'StartRowFillCount', 'EndRowFillColor', 'EndRowFillCount',
  'SkipFirstAlternatingFillRows', 'SkipLastAlternatingFillRows', 'StartColumnFillColor', 'StartColumnFillCount', 'EndColumnFillColor',
  'EndColumnFillCount', 'SkipFirstAlternatingFillColumns', 'SkipLastAlternatingFillColumns',
])
const CELL_HANDLED = new Set([
  'AppliedCellStyle', 'FillColor', 'FillTint', 'VerticalJustification', 'TopInset', 'BottomInset', 'LeftInset', 'RightInset',
  'TopEdgeStrokeWeight', 'BottomEdgeStrokeWeight', 'LeftEdgeStrokeWeight', 'RightEdgeStrokeWeight', 'TopEdgeStrokeColor',
  'BottomEdgeStrokeColor', 'LeftEdgeStrokeColor', 'RightEdgeStrokeColor', 'TopEdgeStrokeType', 'BottomEdgeStrokeType',
  'LeftEdgeStrokeType', 'RightEdgeStrokeType', 'CellType', 'TextRotation', 'DiagonalLineInFront', 'TopLeftDiagonalLine',
  'TopRightDiagonalLine',
])

function slug(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'style'
}

function uniqueClasses(styles: IdmlStyle[], kind: 'table' | 'cell', prefix: string): Map<string, string> {
  const result = new Map<string, string>()
  const taken = new Set<string>()
  for (const style of styles.filter((candidate) => candidate.kind === kind)) {
    const base = `${prefix}${slug(style.name)}`
    let value = base
    let suffix = 2
    while (taken.has(value)) value = `${base}-${suffix++}`
    taken.add(value)
    result.set(style.id, value)
  }
  return result
}

function tint(color: string, raw: string | undefined): string {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value < 100 ? `color-mix(in srgb, ${color} ${value}%, #fff)` : color
}

function active(value: string | undefined): boolean {
  return value !== undefined && !['', 'false', '0', 'None', '$ID/None'].includes(value)
}

export interface CellClassInput {
  tableStyle?: string
  region: 'header' | 'body' | 'footer'
  column: number
  columnCount: number
  node: IdmlTextNode
  direction: 'ltr' | 'rtl'
}

export class TableStyleMapper {
  private readonly tableClasses: Map<string, string>
  private readonly cellClassesById: Map<string, string>
  private readonly usedTables = new Set<string>()
  private readonly usedCells = new Set<string>()
  private readonly reported = new Set<string>()

  constructor(
    private readonly styles: IdmlStyle[],
    private readonly swatches: IdmlSwatch[],
    private readonly report: ReportCollector,
    private readonly overrideClass: (declarations: string) => string | undefined,
  ) {
    this.tableClasses = uniqueClasses(styles, 'table', 'idml-t-')
    this.cellClassesById = uniqueClasses(styles, 'cell', 'idml-cell-')
  }

  tableClass(id: string | undefined): string | undefined {
    const style = this.find(id, 'table')
    if (!style) return undefined
    this.usedTables.add(style.id)
    return this.tableClasses.get(style.id)
  }

  cellClasses(input: CellClassInput): string[] {
    const table = flattenedStyle(this.styles, input.tableStyle, 'table')
    const regionProperty = `${input.region[0]?.toUpperCase()}${input.region.slice(1)}RegionCellStyle`
    const physicalFirst = input.direction === 'rtl' ? input.columnCount - 1 : 0
    const physicalLast = input.direction === 'rtl' ? 0 : input.columnCount - 1
    const regionIds = [table[regionProperty], input.column === physicalFirst ? table.LeftColumnRegionCellStyle : undefined,
      input.column === physicalLast ? table.RightColumnRegionCellStyle : undefined].filter((value): value is string => Boolean(value))
    const ownId = input.node.attributes.AppliedCellStyle
    const ids = [...regionIds, ownId].filter((value): value is string => Boolean(value))
    const output: string[] = []
    for (const id of ids) {
      const style = this.find(id, 'cell')
      if (!style) continue
      this.usedCells.add(style.id)
      const className = this.cellClassesById.get(style.id)
      if (className) output.push(className)
    }
    const base = Object.assign({}, ...ids.map((id) => flattenedStyle(this.styles, id, 'cell')))
    const local = Object.fromEntries(Object.entries(input.node.attributes).filter(([name, value]) => CELL_HANDLED.has(name) && name !== 'AppliedCellStyle' && value !== base[name]))
    const override = this.overrideClass(this.cellDeclarations(local, input.node.location))
    if (override) output.push(override)
    this.reportFeatures(input.node)
    return output
  }

  css(): string {
    const rules: string[] = []
    for (const id of this.usedTables) {
      const style = this.find(id, 'table')
      const className = style && this.tableClasses.get(style.id)
      if (!style || !className) continue
      const values = flattenedStyle(this.styles, id, 'table')
      const declarations = [`border-collapse:collapse`]
      const before = Number(values.SpaceBefore)
      const after = Number(values.SpaceAfter)
      if (Number.isFinite(before)) declarations.push(`margin-block-start:${before}pt`)
      if (Number.isFinite(after)) declarations.push(`margin-block-end:${after}pt`)
      rules.push(`.${className}{${declarations.join(';')}}`, ...this.alternatingRules(className, values, style.location))
      this.reportUnmapped(style, TABLE_HANDLED)
    }
    for (const id of this.usedCells) {
      const style = this.find(id, 'cell')
      const className = style && this.cellClassesById.get(style.id)
      if (!style || !className) continue
      rules.push(`.${className}{${this.cellDeclarations(flattenedStyle(this.styles, id, 'cell'), style.location)}}`)
      this.reportUnmapped(style, CELL_HANDLED)
    }
    return rules.join('')
  }

  private find(id: string | undefined, kind: 'table' | 'cell'): IdmlStyle | undefined {
    if (!id) return undefined
    return this.styles.find((style) => style.kind === kind && (style.id === id || style.name === id || style.id.endsWith(`/${id}`)))
  }

  private reportUnmapped(style: IdmlStyle, handled: Set<string>): void {
    const resolved: Record<string, string> = {}
    for (const source of styleChain(this.styles, style.id, style.kind)) {
      Object.assign(resolved, source.properties)
      for (const property of reportableStyleProperties(source.properties, resolved).filter((name) => !handled.has(name))) {
        const key = `${source.id}\0${property}`
        if (this.reported.has(key)) continue
        this.reported.add(key)
        this.report.add(this.report.unsupportedStyleProperties, property, source.location)
      }
    }
  }

  private reportFeatures(node: IdmlTextNode): void {
    if (node.attributes.CellType === 'GraphicTypeCell') this.report.add(this.report.unsupportedElements, 'Table:GraphicCell', node.location)
    if (active(node.attributes.TextRotation)) this.report.add(this.report.unsupportedElements, 'Table:RotatedCell', node.location)
    if (active(node.attributes.DiagonalLineInFront) || active(node.attributes.TopLeftDiagonalLine) || active(node.attributes.TopRightDiagonalLine)) {
      this.report.add(this.report.unsupportedElements, 'Table:DiagonalLine', node.location)
    }
  }

  private cellDeclarations(values: Record<string, string>, location: string): string {
    const output: string[] = []
    const edge = (name: 'Top' | 'Bottom' | 'Left' | 'Right') => {
      const logical = name === 'Top' ? 'block-start' : name === 'Bottom' ? 'block-end' : name === 'Left' ? 'inline-start' : 'inline-end'
      const weight = Number(values[`${name}EdgeStrokeWeight`])
      if (Number.isFinite(weight)) output.push(`border-${logical}-width:${weight}pt`)
      const type = values[`${name}EdgeStrokeType`]
      if (type) {
        const normalized = type.replace(/^\$ID\//, '').toLowerCase()
        if (['solid', 'dashed', 'dotted'].includes(normalized)) output.push(`border-${logical}-style:${normalized}`)
        else this.report.add(this.report.unsupportedElements, `Table:StrokeType:${type}`, location)
      }
      const color = resolveSwatchColor(values[`${name}EdgeStrokeColor`], this.swatches, this.report, location, 'fill', `${name}EdgeStrokeColor`)
      if (color && color !== 'none') output.push(`border-${logical}-color:${color}`)
    }
    for (const name of ['Top', 'Bottom', 'Left', 'Right'] as const) edge(name)
    for (const [name, property] of [['TopInset', 'block-start'], ['BottomInset', 'block-end'], ['LeftInset', 'inline-start'], ['RightInset', 'inline-end']] as const) {
      const value = Number(values[name])
      if (Number.isFinite(value)) output.push(`padding-${property}:${value}pt`)
    }
    const fill = resolveSwatchColor(values.FillColor, this.swatches, this.report, location, 'fill')
    if (fill && fill !== 'none') output.push(`background-color:${tint(fill, values.FillTint)}`)
    const vertical = values.VerticalJustification?.replace(/^\$ID\//, '').toLowerCase()
    if (vertical === 'topalign' || vertical === 'top') output.push('vertical-align:top')
    else if (vertical === 'centeralign' || vertical === 'center') output.push('vertical-align:middle')
    else if (vertical === 'bottomalign' || vertical === 'bottom') output.push('vertical-align:bottom')
    else if (vertical && vertical !== 'none') this.report.add(this.report.unsupportedElements, 'Table:VerticalJustify', location)
    return output.join(';')
  }

  private alternatingRules(className: string, values: Record<string, string>, location: string): string[] {
    const axis = values.AlternatingFills?.includes('Column') ? 'Column' : values.AlternatingFills?.includes('Row') ? 'Row' : undefined
    if (!axis) return []
    const a = Math.max(0, Number(values[`Start${axis}FillCount`]) || 0)
    const b = Math.max(0, Number(values[`End${axis}FillCount`]) || 0)
    const period = a + b
    if (period === 0) return []
    const selector = axis === 'Row' ? 'tr' : 'td'
    const skip = Math.max(0, Number(values[`SkipFirstAlternatingFill${axis}s`]) || 0)
    const colors = [values[`Start${axis}FillColor`], values[`End${axis}FillColor`]]
    const rules: string[] = []
    for (let index = 0; index < period; index += 1) {
      const color = resolveSwatchColor(colors[index < a ? 0 : 1], this.swatches, this.report, location, 'fill')
      if (color && color !== 'none') rules.push(`.${className} ${selector}:nth-child(${period}n+${skip + index + 1}){background-color:${color}}`)
    }
    return rules
  }
}
