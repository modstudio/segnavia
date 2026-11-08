import { type FontReference, localFontReferences } from './fonts.ts'
import type { Motif } from './motif.ts'
import {
  type Dimension,
  type HexColor,
  type PageGeometry,
  type StyleSheet,
  TEXT_STYLE_PROPERTIES,
  type TextStyle,
  type TextStyleTokenGroup,
} from './style-sheet.ts'

export type StyleOrigin = 'brand' | 'document'
export interface OriginEntry<T> {
  origin: StyleOrigin
  value: T
}

export interface MergedStyleSheet {
  tokens: {
    colors: Record<string, OriginEntry<HexColor>>
    dimensions: Record<string, OriginEntry<Dimension>>
    fontFamilies: Record<string, OriginEntry<string[]>>
  }
  textStyles: Record<string, OriginEntry<TextStyle>>
  pageGeometries: Record<string, OriginEntry<PageGeometry>>
  motifs: Array<OriginEntry<Motif>>
  fonts: FontReference[]
  css: { brand?: string; document?: string }
}

export type MergeStyleSheetsResult = { ok: true; sheet: MergedStyleSheet } | { ok: false; refusal: string }

function mergeRecord<T>(brand: Record<string, T> = {}, document: Record<string, T> = {}): Record<string, OriginEntry<T>> {
  return {
    ...Object.fromEntries(Object.entries(brand).map(([key, value]) => [key, { origin: 'brand' as const, value }])),
    ...Object.fromEntries(Object.entries(document).map(([key, value]) => [key, { origin: 'document' as const, value }])),
  }
}

function motifRecord(motifs: readonly Motif[] | undefined): Record<string, Motif> {
  return Object.fromEntries((motifs ?? []).map((motif) => [motif.key, motif]))
}

function mergedFonts(brand: readonly FontReference[] = [], document: readonly FontReference[] = []): FontReference[] {
  const references = [...brand, ...document]
  const locals = localFontReferences(references)
  const localKeys = new Set(locals.map((reference) => JSON.stringify(reference)))
  const seenApps = new Set<string>()
  return references.filter((reference) => {
    if ('local' in reference) {
      const key = JSON.stringify(reference)
      if (!localKeys.has(key)) return false
      localKeys.delete(key)
      return true
    }
    if (seenApps.has(reference.app)) return false
    seenApps.add(reference.app)
    return true
  })
}

function refusal(path: string, problem: string, remedy: string): MergeStyleSheetsResult {
  return { ok: false, refusal: `${path} could not be resolved: ${problem}; ${remedy} to clear this refusal` }
}

function validateBasedOn(styles: Record<string, OriginEntry<TextStyle>>): MergeStyleSheetsResult | undefined {
  for (const [name, entry] of Object.entries(styles)) {
    if (entry.value.basedOn === undefined) continue
    const parent = styles[entry.value.basedOn]
    if (!parent)
      return refusal(`textStyles.${name}.basedOn`, `style ${JSON.stringify(entry.value.basedOn)} is unknown`, 'add that text style or remove basedOn')
    if (parent.value.kind !== entry.value.kind) {
      return refusal(
        `textStyles.${name}.basedOn`,
        `${JSON.stringify(entry.value.basedOn)} is a ${parent.value.kind} style, not a ${entry.value.kind} style`,
        'name a text style of the same kind or remove basedOn',
      )
    }
    const chain = [name]
    let cursor: TextStyle | undefined = entry.value
    while (cursor?.basedOn !== undefined) {
      const nextName: string = cursor.basedOn
      if (chain.includes(nextName)) {
        return refusal(`textStyles.${name}.basedOn`, `the chain has a cycle ${[...chain, nextName].join(' -> ')}`, 'remove a basedOn link')
      }
      chain.push(nextName)
      if (chain.length > 9) {
        return refusal(`textStyles.${name}.basedOn`, `the inheritance chain is deeper than 8`, 'shorten the basedOn chain to at most 8 links')
      }
      cursor = styles[nextName]?.value
    }
  }
  return undefined
}

function tokenReference(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('token' in value)) return undefined
  return typeof value.token === 'string' ? value.token : undefined
}

function validateTokens(sheet: MergedStyleSheet): MergeStyleSheetsResult | undefined {
  for (const [name, entry] of Object.entries(sheet.textStyles)) {
    for (const [property, fact] of Object.entries(TEXT_STYLE_PROPERTIES)) {
      const token = tokenReference(entry.value[property as keyof TextStyle])
      const tokenGroup = 'tokenGroup' in fact ? (fact.tokenGroup as TextStyleTokenGroup) : undefined
      if (token === undefined || tokenGroup === undefined || sheet.tokens[tokenGroup][token] !== undefined) continue
      return refusal(
        `textStyles.${name}.${property}.token`,
        `${JSON.stringify(token)} is unknown in tokens.${tokenGroup}`,
        `add tokens.${tokenGroup}.${token} or use a literal value`,
      )
    }
  }
  return undefined
}

export function mergeStyleSheets(brand: StyleSheet | undefined, document: StyleSheet): MergeStyleSheetsResult {
  const sheet: MergedStyleSheet = {
    tokens: {
      colors: mergeRecord(brand?.tokens?.colors, document.tokens?.colors),
      dimensions: mergeRecord(brand?.tokens?.dimensions, document.tokens?.dimensions),
      fontFamilies: mergeRecord(brand?.tokens?.fontFamilies, document.tokens?.fontFamilies),
    },
    textStyles: mergeRecord(brand?.textStyles, document.textStyles),
    pageGeometries: mergeRecord(brand?.pageGeometries, document.pageGeometries),
    motifs: Object.values(mergeRecord(motifRecord(brand?.motifs), motifRecord(document.motifs))),
    fonts: mergedFonts(brand?.fonts, document.fonts),
    css: { brand: brand?.css, document: document.css },
  }
  return validateBasedOn(sheet.textStyles) ?? validateTokens(sheet) ?? { ok: true, sheet }
}
