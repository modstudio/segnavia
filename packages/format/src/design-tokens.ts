import { STYLE_NAME, type StyleSheet } from './style-sheet.ts'

export type DesignTokens = NonNullable<StyleSheet['tokens']>
type JsonObject = Record<string, unknown>

const unitPx = { mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72 } as const
const SEGNAVIA_EXTENSION = 'org.segnavia'

function colorValue(hex: string): JsonObject {
  const raw = hex.slice(1)
  const expanded = raw.length === 3 || raw.length === 4 ? [...raw].map((part) => `${part}${part}`).join('') : raw
  const channels = [0, 2, 4].map((start) => Number.parseInt(expanded.slice(start, start + 2), 16))
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : 1
  return {
    colorSpace: 'srgb',
    components: channels.map((channel) => channel / 255),
    ...(alpha === 1 ? {} : { alpha }),
    hex: `#${expanded.slice(0, 6).toLowerCase()}`,
  }
}

function dimensionEntry(name: string, dimension: NonNullable<DesignTokens['dimensions']>[string]): JsonObject {
  if (dimension.unit === 'em') throw new Error(`Dimension token ${JSON.stringify(name)} uses em; use rem or an absolute unit to clear this refusal`)
  if (dimension.unit === 'px' || dimension.unit === 'rem') return { $value: { value: dimension.value, unit: dimension.unit } }
  const factor = unitPx[dimension.unit]
  return {
    $value: { value: dimension.value * factor, unit: 'px' },
    $extensions: { [SEGNAVIA_EXTENSION]: { value: dimension.value, unit: dimension.unit } },
  }
}

interface TokenGroup {
  $type: string
  values: (tokens: DesignTokens) => Record<string, unknown> | undefined
  encode: (name: string, value: unknown) => JsonObject
}

const GROUPS = {
  color: {
    $type: 'color',
    values: (tokens) => tokens.colors,
    encode: (_name, value) => ({ $value: colorValue(value as string) }),
  },
  dimension: {
    $type: 'dimension',
    values: (tokens) => tokens.dimensions,
    encode: (name, value) => dimensionEntry(name, value as NonNullable<DesignTokens['dimensions']>[string]),
  },
  fontFamily: {
    $type: 'fontFamily',
    values: (tokens) => tokens.fontFamilies,
    encode: (_name, value) => ({ $value: value }),
  },
} satisfies Record<string, TokenGroup>

const GROUP_TYPES = new Set(Object.values(GROUPS).map((group) => group.$type))

export function exportDesignTokens(tokens: DesignTokens): JsonObject {
  return Object.fromEntries(
    Object.entries(GROUPS).map(([name, group]) => [
      name,
      { $type: group.$type, ...Object.fromEntries(Object.entries(group.values(tokens) ?? {}).map(([key, value]) => [key, group.encode(key, value)])) },
    ]),
  )
}

interface HeldToken {
  path: string
  name: string
  type: string
  value: unknown
  extensions?: unknown
}

function objectAt(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Token ${path || '<root>'} is not an object`)
  return value as JsonObject
}

function collect(value: JsonObject, path: string[] = [], inheritedType?: string, held: HeldToken[] = [], namePath = path): HeldToken[] {
  if ('$ref' in value) throw new Error(`Token ${path.join('.')} uses unsupported $ref; use a {group.token} alias to clear this refusal`)
  const type = typeof value.$type === 'string' ? value.$type : inheritedType
  if (type !== undefined && !GROUP_TYPES.has(type)) {
    throw new Error(`Token ${path.join('.')} has unknown $type ${JSON.stringify(type)}; use color, dimension or fontFamily to clear this refusal`)
  }
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$')) continue
    const childPath = [...path, key]
    const childNamePath = path.length === 0 && key in GROUPS ? [] : [...namePath, key]
    const object = objectAt(child, childPath.join('.'))
    if ('$value' in object) {
      if (!type) throw new Error(`Token ${childPath.join('.')} has no $type; declare its supported type to clear this refusal`)
      const name = childNamePath.join('-')
      if (!STYLE_NAME.test(name)) throw new Error(`Token ${childPath.join('.')} flattens to invalid StyleName ${JSON.stringify(name)}`)
      held.push({ path: childPath.join('.'), name, type, value: object.$value, extensions: object.$extensions })
    } else collect(object, childPath, type, held, childNamePath)
  }
  return held
}

function aliasPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^\{([^{}]+)\}$/.exec(value)
  return match?.[1]
}

function resolveAliases(tokens: HeldToken[]): HeldToken[] {
  const byPath = new Map(tokens.map((token) => [token.path, token]))
  const resolve = (token: HeldToken, chain: string[]): HeldToken => {
    const alias = aliasPath(token.value)
    if (!alias) return token
    if (chain.includes(token.path)) throw new Error(`Token ${token.path} has a cyclic alias through ${[...chain, token.path].join(' -> ')}`)
    const target = byPath.get(alias)
    if (!target) throw new Error(`Token ${token.path} has unresolved alias {${alias}}`)
    const resolved = resolve(target, [...chain, token.path])
    return { ...token, value: resolved.value }
  }
  return tokens.map((token) => resolve(token, []))
}

function importColor(token: HeldToken): string {
  const value = objectAt(token.value, token.path)
  if (value.colorSpace !== 'srgb') throw new Error(`Token ${token.path} uses color space ${JSON.stringify(value.colorSpace)}; use srgb to clear this refusal`)
  const components = value.components
  if (!Array.isArray(components) || components.length !== 3 || components.some((part) => typeof part !== 'number' || part < 0 || part > 1)) {
    throw new Error(`Token ${token.path} has invalid srgb components`)
  }
  const alpha = value.alpha === undefined ? 1 : value.alpha
  if (typeof alpha !== 'number' || alpha < 0 || alpha > 1) throw new Error(`Token ${token.path} has invalid alpha`)
  const byte = (part: number) =>
    Math.round(part * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${components.map(byte).join('')}${alpha === 1 ? '' : byte(alpha)}`
}

function importDimension(token: HeldToken): NonNullable<DesignTokens['dimensions']>[string] {
  const value = objectAt(token.value, token.path)
  const extension = typeof token.extensions === 'object' && token.extensions !== null ? objectAt(token.extensions, token.path)[SEGNAVIA_EXTENSION] : undefined
  const preferred = extension === undefined ? value : objectAt(extension, token.path)
  if (typeof preferred.value !== 'number' || !['pt', 'px', 'mm', 'cm', 'in', 'em', 'rem'].includes(String(preferred.unit))) {
    throw new Error(`Token ${token.path} has an invalid dimension`)
  }
  return { value: preferred.value, unit: preferred.unit as NonNullable<DesignTokens['dimensions']>[string]['unit'] }
}

export function importDesignTokens(json: unknown): DesignTokens {
  const colors: NonNullable<DesignTokens['colors']> = {}
  const dimensions: NonNullable<DesignTokens['dimensions']> = {}
  const fontFamilies: NonNullable<DesignTokens['fontFamilies']> = {}
  for (const token of resolveAliases(collect(objectAt(json, '')))) {
    if (token.type === 'color') colors[token.name] = importColor(token)
    if (token.type === 'dimension') dimensions[token.name] = importDimension(token)
    if (token.type === 'fontFamily') {
      const families = typeof token.value === 'string' ? [token.value] : token.value
      if (!Array.isArray(families) || families.length === 0 || families.some((family) => typeof family !== 'string' || family.length === 0)) {
        throw new Error(`Token ${token.path} has an invalid font family`)
      }
      fontFamilies[token.name] = families
    }
  }
  return { colors, dimensions, fontFamilies }
}
