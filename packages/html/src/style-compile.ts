import {
  type Dimension,
  type FontManifest,
  type MergedStyleSheet,
  type Motif,
  mergeStyleSheets,
  type PageGeometry,
  type StyleOrigin,
  type StyleSheet,
  TEXT_STYLE_PROPERTIES,
  type TextStyle,
  type TextStyleTokenGroup,
} from '@segnavia/format'
import { sanitizeBookCss } from './book-css.ts'
import type { CssPreflightFinding } from './sanitize-css.ts'
import { quoteFamily } from './css-family.ts'
import { cssTokens } from './css-tokens.ts'

const LAYER_ORDER = '@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;'
const DEFAULT_BASE_CSS = ''

export interface CompileStyleSheetOptions {
  brand?: StyleSheet
  document: StyleSheet
  baseCss?: string
  preflight?: CssPreflightFinding[]
}

export type CompileStyleSheetResult =
  | { ok: true; sheets: string[]; geometries: Record<string, PageGeometry>; motifs: Motif[]; fonts: FontManifest }
  | { ok: false; refusal: string }

const TOKEN_PREFIX: Record<TextStyleTokenGroup, string> = {
  colors: 'color',
  dimensions: 'size',
  fontFamilies: 'family',
}

function dimension(value: Dimension): string {
  return `${value.value}${value.unit}`
}

function familyStack(families: readonly string[]): string {
  return families.map((family) => quoteFamily(family, { quote: 'when-needed', controlCharacter: 'escape' })).join(',')
}

function tokenValue(group: TextStyleTokenGroup, value: unknown): string {
  if (group === 'dimensions') return dimension(value as Dimension)
  if (group === 'fontFamilies') return familyStack(value as string[])
  return value as string
}

function tokensCss(sheet: MergedStyleSheet, origin: StyleOrigin): string {
  const declarations: string[] = []
  for (const group of ['colors', 'dimensions', 'fontFamilies'] as const) {
    for (const [name, entry] of Object.entries(sheet.tokens[group])) {
      if (entry.origin === origin) declarations.push(`--segnavia-${TOKEN_PREFIX[group]}-${name}:${tokenValue(group, entry.value)}`)
    }
  }
  return declarations.length === 0 ? '' : `:root{${declarations.join(';')}}`
}

function flattenedStyle(name: string, styles: MergedStyleSheet['textStyles']): TextStyle {
  const chain: TextStyle[] = []
  let cursor = styles[name]?.value
  while (cursor) {
    chain.unshift(cursor)
    cursor = cursor.basedOn === undefined ? undefined : styles[cursor.basedOn]?.value
  }
  return Object.assign({}, ...chain)
}

function styleValue(property: keyof typeof TEXT_STYLE_PROPERTIES, value: unknown): string | undefined {
  if (property === 'keepWithNext') return value === true ? 'next' : undefined
  if (typeof value === 'object' && value !== null && 'token' in value) {
    const fact = TEXT_STYLE_PROPERTIES[property]
    if (!('tokenGroup' in fact)) return undefined
    const group: TextStyleTokenGroup = fact.tokenGroup
    return `var(--segnavia-${TOKEN_PREFIX[group]}-${String(value.token)})`
  }
  if (property === 'fontFamily') return familyStack(value as string[])
  if (typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) return dimension(value as Dimension)
  return String(value)
}

function textStylesCss(sheet: MergedStyleSheet, origin: StyleOrigin): string {
  const rules: string[] = []
  for (const [name, entry] of Object.entries(sheet.textStyles)) {
    if (entry.origin !== origin) continue
    const style = flattenedStyle(name, sheet.textStyles)
    const declarations: string[] = []
    for (const [property, fact] of Object.entries(TEXT_STYLE_PROPERTIES) as Array<
      [keyof typeof TEXT_STYLE_PROPERTIES, (typeof TEXT_STYLE_PROPERTIES)[keyof typeof TEXT_STYLE_PROPERTIES]]
    >) {
      const value = style[property as keyof TextStyle]
      if (value === undefined) continue
      const compiled = styleValue(property, value)
      if (compiled !== undefined) declarations.push(`${fact.cssProperty}:${compiled}`)
    }
    rules.push(`.segnavia-style-${name}{${declarations.join(';')}}`)
  }
  return rules.join('')
}

function layer(name: string, css: string): string {
  return `@layer segnavia.${name}{${css}}`
}

function balanceBlocks(css: string): string {
  let depth = 0
  let copiedUntil = 0
  let balanced = ''
  for (const token of cssTokens(css)) {
    const character = css[token.start]
    if (token.kind === 'open' && character === '{') depth++
    if (token.kind !== 'close' || character !== '}') continue
    if (depth > 0) {
      depth--
      continue
    }
    // Unmatched closing braces are omitted so wrapped text cannot end its containing layer.
    balanced += css.slice(copiedUntil, token.start)
    copiedUntil = token.end
  }
  return `${balanced}${css.slice(copiedUntil)}${'}'.repeat(depth)}`
}

/**
 * Compiles each free CSS value into a separate stylesheet so CSS parse recovery
 * cannot let an unfinished construct consume typed rules from a later sheet.
 */
export function compileStyleSheet(options: CompileStyleSheetOptions): CompileStyleSheetResult {
  const merged = mergeStyleSheets(options.brand, options.document)
  if (!merged.ok) return merged
  const { sheet } = merged
  const brandCss = balanceBlocks(sanitizeBookCss(sheet.css.brand, options.preflight).css)
  const brandTypedCss = `${tokensCss(sheet, 'brand')}${textStylesCss(sheet, 'brand')}`
  const documentCss = `${tokensCss(sheet, 'document')}${textStylesCss(sheet, 'document')}`
  const authorCss = balanceBlocks(sanitizeBookCss(sheet.css.document, options.preflight).css)
  const sheets = [
    `${LAYER_ORDER}${layer('base', options.baseCss ?? DEFAULT_BASE_CSS)}${layer('brand', brandTypedCss)}`,
    ...(brandCss === '' ? [] : [layer('brand', brandCss)]),
    layer('document', documentCss),
    ...(authorCss === '' ? [] : [layer('author', authorCss)]),
  ]
  return {
    ok: true,
    sheets,
    geometries: Object.fromEntries(Object.entries(sheet.pageGeometries).map(([name, entry]) => [name, entry.value])),
    motifs: sheet.motifs.map((entry) => entry.value),
    fonts: sheet.fonts,
  }
}
