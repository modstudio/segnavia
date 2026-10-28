import { type Element, isTag } from 'domhandler'
import type { ReportCollector } from './report.ts'
import { stylePropertyMapping } from './style-mappings.ts'
import { reportableStyleProperties } from './style-property-report.ts'
import type { IdmlStyle, IdmlSwatch } from './types.ts'
import { idmlDirection, localName } from './xml.ts'

const PARAGRAPH_ROOT = '$ID/[No paragraph style]'
const CHARACTER_ROOT = '$ID/[No character style]'
function text(element: Element): string {
  return element.children
    .map((child) => ('data' in child ? child.data : isTag(child) ? text(child) : ''))
    .join('')
    .trim()
}

function properties(element: Element): Record<string, string> {
  const result: Record<string, string> = { ...element.attribs }
  const holder = element.children.find((child): child is Element => isTag(child) && localName(child.name) === 'Properties')
  for (const child of holder?.children ?? []) {
    if (!isTag(child)) continue
    const value = text(child)
    if (value || child.children.some(isTag)) result[localName(child.name)] = value || '[entry]'
  }
  return result
}

export function parseStyles(roots: Element[], part: string): IdmlStyle[] {
  const result: IdmlStyle[] = []
  for (const kind of ['ParagraphStyle', 'CharacterStyle'] as const) {
    for (const element of roots.filter((candidate) => localName(candidate.name) === kind)) {
      const values = properties(element)
      const id = values.Self
      if (!id) continue
      result.push({
        id,
        name: values.Name ?? id.split('/').at(-1) ?? id,
        kind: kind === 'ParagraphStyle' ? 'paragraph' : 'character',
        ...(values.BasedOn ? { basedOn: values.BasedOn } : {}),
        properties: Object.fromEntries(Object.entries(values).filter(([name]) => !['Self', 'Name', 'BasedOn'].includes(name))),
        location: `${part}#${id}`,
      })
    }
  }
  return result
}

export function parseSwatches(roots: Element[]): IdmlSwatch[] {
  const result: IdmlSwatch[] = []
  for (const element of roots.filter((candidate) => localName(candidate.name) === 'Color')) {
    const id = element.attribs.Self
    if (!id) continue
    const name = element.attribs.Name ?? id
    const space = element.attribs.Space
    const values = (element.attribs.ColorValue ?? '').trim().split(/\s+/).map(Number).filter(Number.isFinite)
    const model = element.attribs.Model === 'Spot' ? 'spot' : space === 'RGB' ? 'rgb' : space === 'CMYK' ? 'cmyk' : 'named'
    result.push({ id, name, model, ...(values.length > 0 ? { values } : {}) })
  }
  return result
}

function rootName(kind: IdmlStyle['kind']): string {
  return kind === 'paragraph' ? PARAGRAPH_ROOT : CHARACTER_ROOT
}

function slug(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'style'
}

const LANGUAGES: Record<string, string> = {
  '$ID/Hebrew': 'he',
  '$ID/English: USA': 'en-US',
  '$ID/English: UK': 'en-GB',
  '$ID/French': 'fr',
  '$ID/German': 'de',
  '$ID/Spanish': 'es',
  '$ID/Italian': 'it',
  '$ID/Arabic': 'ar',
}

function hasCssMapping(names: Set<string>, css: string): boolean {
  return [...names].some((name) => {
    const mapping = stylePropertyMapping(name)
    return mapping?.kind === 'css' && mapping.css === css
  })
}

function textDeclarations(values: Record<string, string>, mapped: Set<string>, output: string[]): void {
  if (mapped.has('Capitalization') && values.Capitalization === 'SmallCaps') output.push('font-variant-caps:small-caps')
  if (mapped.has('Capitalization') && values.Capitalization === 'AllCaps') output.push('text-transform:uppercase')
  if (mapped.has('Underline') && (values.Underline === 'true' || values.Underline === 'Underline')) output.push('text-decoration-line:underline')
}

export class StyleMapper {
  private readonly byId: Map<string, IdmlStyle>
  private readonly classes = new Map<string, string>()
  private readonly used = new Set<string>()
  private readonly overrides = new Map<string, { name: string; properties: Record<string, string>; direction: 'ltr' | 'rtl' }>()
  private readonly reportedStyleProperties = new Set<string>()

  constructor(
    styles: IdmlStyle[],
    private readonly swatches: IdmlSwatch[],
    private readonly report: ReportCollector,
    private readonly bookDirection: 'ltr' | 'rtl',
  ) {
    this.byId = new Map(styles.map((style) => [style.id, style]))
    const taken = new Set<string>()
    for (const style of styles) {
      const prefix = style.kind === 'paragraph' ? 'idml-p-' : 'idml-c-'
      const base = `${prefix}${slug(style.name)}`
      let candidate = base
      let suffix = 2
      while (taken.has(candidate)) candidate = `${base}-${suffix++}`
      taken.add(candidate)
      this.classes.set(style.id, candidate)
    }
  }

  flattened(id: string | undefined, kind: IdmlStyle['kind']): Record<string, string> {
    return Object.assign({}, ...this.styleChain(id, kind).map((style) => style.properties))
  }

  private styleChain(id: string | undefined, kind: IdmlStyle['kind']): IdmlStyle[] {
    const root = this.rootStyle(kind)
    const chain: IdmlStyle[] = []
    const seen = new Set<string>()
    let current = this.findStyle(id, kind)
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      chain.unshift(current)
      current = this.findStyle(current.basedOn, kind)
    }
    if (root && !chain.includes(root)) chain.unshift(root)
    return chain
  }

  styleClass(id: string | undefined, _kind: IdmlStyle['kind']): string | undefined {
    if (!id || id.includes('[None]') || id.includes('[No character style]')) return undefined
    const style = this.findStyle(id, _kind)
    const value = style ? this.classes.get(style.id) : undefined
    if (value && style) this.used.add(style.id)
    return value
  }

  overrideClass(
    values: Record<string, string>,
    base: Record<string, string>,
    directionValue: 'ltr' | 'rtl',
    location: string,
    styleDirection?: 'ltr' | 'rtl',
  ): string | undefined {
    const changed = Object.fromEntries(
      Object.entries(values).filter(([name, value]) => stylePropertyMapping(name)?.kind !== 'non-formatting' && value !== base[name]),
    )
    const resolved = { ...base, ...values }
    for (const name of reportableStyleProperties(changed, resolved)) {
      this.report.add(this.report.unsupportedOverrideProperties, name, location)
    }
    if (changed.AppliedFont !== undefined || changed.FontStyle !== undefined) this.report.font(resolved.AppliedFont, resolved.FontStyle, location)
    const cssProperties = Object.fromEntries(Object.entries(changed).filter(([name]) => stylePropertyMapping(name)?.kind === 'css'))
    if (styleDirection && styleDirection !== directionValue) {
      for (const name of ['LeftIndent', 'RightIndent']) cssProperties[name] = base[name] ?? '0'
      for (const name of ['Justification']) {
        if (base[name] !== undefined && cssProperties[name] === undefined) cssProperties[name] = base[name]
      }
    }
    if (Object.keys(cssProperties).length === 0) return undefined
    const key = JSON.stringify(Object.entries(cssProperties).sort(([a], [b]) => a.localeCompare(b))) + directionValue
    const found = this.overrides.get(key)
    if (found) return found.name
    const name = `idml-o-${this.overrides.size + 1}`
    this.overrides.set(key, { name, properties: cssProperties, direction: directionValue })
    return name
  }

  paragraphDirection(properties: Record<string, string>): 'ltr' | 'rtl' | undefined {
    return idmlDirection(properties.ParagraphDirection)
  }

  paragraphStyleDirection(properties: Record<string, string>): 'ltr' | 'rtl' {
    return this.paragraphDirection(properties) ?? this.bookDirection
  }

  language(value: string | undefined, location: string): string | undefined {
    if (!value) return undefined
    const known = LANGUAGES[value]
    if (!known) this.report.add(this.report.unsupportedLanguages, value, location)
    return known
  }

  rootLanguage(): string | undefined {
    const root = this.rootStyle('paragraph')
    return this.language(root?.properties.AppliedLanguage, root?.location ?? 'Resources/Styles.xml')
  }

  css(): string {
    const rules: string[] = []
    for (const id of this.used) {
      const style = this.byId.get(id)
      const name = this.classes.get(id)
      if (!style || !name) continue
      const values = this.flattened(id, style.kind)
      this.reportUnmappedStyleProperties(style)
      this.report.font(values.AppliedFont, values.FontStyle, style.location)
      const dir = style.kind === 'paragraph' ? this.paragraphStyleDirection(values) : this.bookDirection
      const declarations = this.declarations(values, dir, style.location)
      rules.push(`.${name}{${declarations}}`)
    }
    for (const value of this.overrides.values()) {
      const declarations = this.declarations(value.properties, value.direction, value.name, this.report.unsupportedOverrideProperties)
      if (declarations) rules.push(`.${value.name}{${declarations}}`)
    }
    return rules.join('')
  }

  private declarations(values: Record<string, string>, dir: 'ltr' | 'rtl', location: string, unsupported = this.report.unsupportedStyleProperties): string {
    const output: string[] = []
    const mapped = new Set(Object.keys(values).filter((name) => stylePropertyMapping(name)?.kind === 'css'))
    const pt = (name: string, property: string) => {
      if (!mapped.has(name)) return
      const value = Number(values[name])
      if (Number.isFinite(value)) output.push(`${property}:${value}pt`)
    }
    pt('PointSize', 'font-size')
    if (mapped.has('Leading') && values.Leading === 'Auto') output.push(`line-height:${(Number(values.AutoLeading) || 120) / 100}`)
    else pt('Leading', 'line-height')
    const tracking = Number(values.Tracking)
    if (mapped.has('Tracking') && Number.isFinite(tracking)) output.push(`letter-spacing:${tracking / 1000}em`)
    pt('SpaceBefore', 'margin-block-start')
    pt('SpaceAfter', 'margin-block-end')
    pt('FirstLineIndent', 'text-indent')
    const startIndent = dir === 'rtl' ? 'RightIndent' : 'LeftIndent'
    const endIndent = dir === 'rtl' ? 'LeftIndent' : 'RightIndent'
    pt(startIndent, 'padding-inline-start')
    pt(endIndent, 'padding-inline-end')
    textDeclarations(values, mapped, output)
    if (mapped.has('Justification')) this.justification(values.Justification, dir, output, location, unsupported)
    if (hasCssMapping(mapped, 'keeps')) this.keeps(values, output)
    if (mapped.has('StartParagraph') && values.StartParagraph && values.StartParagraph !== 'Anywhere') {
      this.report.add(unsupported, `StartParagraph:${values.StartParagraph}`, location)
    }
    const color = mapped.has('FillColor') ? this.color(values.FillColor, location) : undefined
    if (color) output.push(`color:${color}`)
    return output.join(';')
  }

  private findStyle(id: string | undefined, kind: IdmlStyle['kind']): IdmlStyle | undefined {
    if (!id) return undefined
    const exact = this.byId.get(id)
    if (exact?.kind === kind) return exact
    return [...this.byId.values()].find((style) => style.kind === kind && (style.name === id || style.id.endsWith(`/${id}`)))
  }

  private rootStyle(kind: IdmlStyle['kind']): IdmlStyle | undefined {
    return [...this.byId.values()].find((style) => style.kind === kind && (style.name === rootName(kind) || style.id.endsWith(`/${rootName(kind)}`)))
  }

  private reportUnmappedStyleProperties(style: IdmlStyle): void {
    const root = this.rootStyle(style.kind)
    const resolved: Record<string, string> = {}
    for (const source of this.styleChain(style.id, style.kind)) {
      Object.assign(resolved, source.properties)
      for (const name of reportableStyleProperties(source.properties, resolved, source === root)) {
        const key = `${source.id}\u0000${name}`
        if (this.reportedStyleProperties.has(key)) continue
        this.reportedStyleProperties.add(key)
        this.report.add(this.report.unsupportedStyleProperties, name, source.location)
      }
    }
  }

  private justification(value: string | undefined, dir: 'ltr' | 'rtl', output: string[], location: string, bucket: Map<string, number>): void {
    if (!value) return
    const side = (physical: 'left' | 'right') => (physical === (dir === 'rtl' ? 'right' : 'left') ? 'start' : 'end')
    if (value === 'LeftAlign' || value === 'RightAlign') output.push(`text-align:${side(value === 'LeftAlign' ? 'left' : 'right')}`)
    else if (value === 'CenterAlign') output.push('text-align:center')
    else if (value === 'FullyJustified') output.push('text-align:justify', 'text-align-last:justify')
    else if (value.endsWith('Justified')) {
      output.push('text-align:justify')
      if (value.startsWith('Left')) output.push(`text-align-last:${side('left')}`)
      else if (value.startsWith('Right')) output.push(`text-align-last:${side('right')}`)
      else if (value.startsWith('Center')) output.push('text-align-last:center')
    } else if (value === 'ToBindingSide' || value === 'AwayFromBindingSide') {
      this.report.add(bucket, `Justification:${value}`, location)
    }
  }

  private keeps(values: Record<string, string>, output: string[]): void {
    if ((Number(values.KeepWithNext) || 0) > 0) output.push('break-after:avoid')
    if (values.KeepLinesTogether === 'true' && values.KeepAllLinesTogether === 'true') output.push('break-inside:avoid')
    else if (values.KeepLinesTogether === 'true') {
      const first = Number(values.KeepFirstLines)
      const last = Number(values.KeepLastLines)
      if (Number.isInteger(first) && first > 0) output.push(`orphans:${first}`)
      if (Number.isInteger(last) && last > 0) output.push(`widows:${last}`)
    }
  }

  private color(id: string | undefined, location: string): string | undefined {
    if (!id || id.endsWith('/None')) return undefined
    if (id.endsWith('/Black')) return '#000'
    if (id.endsWith('/Paper')) return '#fff'
    const swatch = this.swatches.find((value) => value.id === id || value.name === id)
    if (!swatch) return undefined
    if (swatch.model === 'spot') {
      this.report.add(this.report.spotColors, swatch.name, location)
      return undefined
    }
    if (swatch.model === 'rgb' && swatch.values?.length === 3) return `rgb(${swatch.values.join(' ')})`
    if (swatch.model === 'cmyk' && swatch.values?.length === 4) {
      const [c, m, y, k] = swatch.values.map((value) => value / 100) as [number, number, number, number]
      return `rgb(${Math.round(255 * (1 - c) * (1 - k))} ${Math.round(255 * (1 - m) * (1 - k))} ${Math.round(255 * (1 - y) * (1 - k))})`
    }
    return undefined
  }
}
