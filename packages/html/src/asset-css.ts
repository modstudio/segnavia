import { type AssetRefusal, type FetchKind, type OriginApproval, originDecision } from '@segnavia/format'
import { type CssToken, cssTokens } from './css-tokens.ts'
import { sanitizeCss } from './sanitize-css.ts'

const ASSET_MARKER = 'data:image/segnavia-asset-'
const ASSET_MARKER_PATTERN = new RegExp(`${ASSET_MARKER}(\\d+),x`, 'g')
const REFUSED_ASSET_MARKER = 'segnavia-refused-asset-'

interface AssetCssOptions {
  dataFonts?: boolean
  keepScripts?: boolean
  origins?: Iterable<OriginApproval>
}

interface CssAssetReference {
  end: number
  importEnd?: number
  importStart?: number
  kind: FetchKind
  start: number
  url: string
}

interface CssEdit {
  end: number
  start: number
  value: string
}

type CssValueSpan = Pick<CssAssetReference, 'end' | 'start' | 'url'>

function innerSpan(source: string, start: number, end: number): CssValueSpan | undefined {
  while (/\s/.test(source[start] ?? '')) start++
  while (end > start && /\s/.test(source[end - 1] ?? '')) end--
  return end > start ? { start, end, url: source.slice(start, end) } : undefined
}

function quotedSpan(source: string, token: CssToken): CssValueSpan | undefined {
  const quote = source[token.start]
  if ((quote !== '"' && quote !== "'") || source[token.end - 1] !== quote) return undefined
  return { start: token.start + 1, end: token.end - 1, url: source.slice(token.start + 1, token.end - 1) }
}

function urlSpan(source: string, tokens: readonly CssToken[], at: number): CssValueSpan | undefined {
  const token = tokens[at]
  if (!token) return undefined
  if (token.kind === 'url') {
    if (source[token.end - 1] !== ')') return undefined
    const open = source.indexOf('(', token.start)
    return open < 0 ? undefined : innerSpan(source, open + 1, token.end - 1)
  }
  if (token.kind !== 'function' || token.value !== 'url') return undefined
  const value = tokens[at + 1]
  const close = tokens[at + 2]
  return value?.kind === 'string' && close?.kind === 'close' && close.value === ')' ? quotedSpan(source, value) : undefined
}

function skippedCssAsset(url: string): boolean {
  return /^data:/i.test(url) || url.startsWith('#') || url.startsWith(ASSET_MARKER) || url.startsWith(REFUSED_ASSET_MARKER)
}

function followingSemicolons(tokens: readonly CssToken[]): (number | undefined)[] {
  const found: (number | undefined)[] = []
  let semicolon: number | undefined
  for (let at = tokens.length - 1; at >= 0; at--) {
    const token = tokens[at]
    if ((token?.kind === 'open' && token.value === '{') || (token?.kind === 'close' && token.value === '}')) semicolon = undefined
    else if (token?.kind === 'semicolon') semicolon = token.end
    found[at] = semicolon
  }
  return found
}

class CssAssetScanner {
  readonly references: CssAssetReference[] = []
  private readonly blocks: boolean[] = []
  private readonly importUrls = new Set<number>()
  private pendingFontFace = false

  constructor(
    private readonly source: string,
    private readonly tokens: readonly CssToken[],
    private readonly semicolons: readonly (number | undefined)[],
  ) {}

  scan(): CssAssetReference[] {
    for (let at = 0; at < this.tokens.length; at++) this.read(at)
    return this.references
  }

  private structure(token: CssToken): boolean {
    if (token.kind === 'at' && token.value === 'font-face') {
      this.pendingFontFace = true
      return true
    }
    if (token.kind === 'open' && token.value === '{') {
      this.blocks.push(this.pendingFontFace || this.blocks.at(-1) === true)
      this.pendingFontFace = false
      return true
    }
    if (token.kind === 'close' && token.value === '}') {
      this.blocks.pop()
      return true
    }
    if (token.kind !== 'semicolon') return false
    this.pendingFontFace = false
    return true
  }

  private import(at: number, token: CssToken): boolean {
    if (token.kind !== 'at' || token.value !== 'import') return false
    const next = this.tokens[at + 1]
    const span = next?.kind === 'string' ? quotedSpan(this.source, next) : urlSpan(this.source, this.tokens, at + 1)
    if (next?.kind === 'url' || (next?.kind === 'function' && next.value === 'url')) this.importUrls.add(at + 1)
    if (span && !skippedCssAsset(span.url)) {
      this.references.push({ ...span, kind: 'style', importStart: token.start, importEnd: this.semicolons[at] })
    }
    return true
  }

  private read(at: number): void {
    const token = this.tokens[at]
    if (!token || this.structure(token) || this.import(at, token) || this.importUrls.has(at)) return
    const span = urlSpan(this.source, this.tokens, at)
    if (span && !skippedCssAsset(span.url)) this.references.push({ ...span, kind: this.blocks.at(-1) ? 'font' : 'image' })
  }
}

function cssAssetReferences(source: string): CssAssetReference[] {
  const tokens = cssTokens(source)
  return new CssAssetScanner(source, tokens, followingSemicolons(tokens)).scan()
}

function applyCssEdits(source: string, edits: CssEdit[]): string {
  let result = source
  for (const edit of edits.sort((left, right) => right.start - left.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
  return result
}

export function assetCss(source: string, declarations: boolean, options: AssetCssOptions): ReturnType<typeof sanitizeCss> & { refusals: AssetRefusal[] } {
  const restores: string[] = []
  const refusedRestores: string[] = []
  const refusals: AssetRefusal[] = []
  let refusedMarker = REFUSED_ASSET_MARKER
  while (source.includes(refusedMarker)) refusedMarker += 'x-'
  let marker = 'segnavia-held-import'
  while (source.includes(marker)) marker += '-x'
  const imports: string[] = []
  const edits: CssEdit[] = []
  for (const reference of cssAssetReferences(source)) {
    const decision = originDecision(reference.url, reference.kind, options.origins, options.keepScripts === true)
    if (!decision.allowed) {
      refusals.push(decision.refusal)
      const index = refusedRestores.push(reference.url) - 1
      edits.push({ start: reference.start, end: reference.end, value: `${refusedMarker}${index}` })
    } else if (reference.importStart !== undefined && reference.importEnd !== undefined) {
      const index = imports.push(source.slice(reference.importStart, reference.importEnd)) - 1
      edits.push({ start: reference.importStart, end: reference.importEnd, value: `.${marker}-${index}{}` })
    } else {
      const index = restores.push(reference.url) - 1
      edits.push({ start: reference.start, end: reference.end, value: `${ASSET_MARKER}${index},x` })
    }
  }
  const result = sanitizeCss(applyCssEdits(source, edits), declarations, options.dataFonts ?? false)
  const refusedPattern = new RegExp(`${refusedMarker}(\\d+)`, 'g')
  const restore = (value: string) =>
    value
      .replace(ASSET_MARKER_PATTERN, (_, index: string) => restores[Number(index)] ?? '')
      .replace(refusedPattern, (_, index: string) => refusedRestores[Number(index)] ?? '')
  let css = restore(result.css)
  for (const [index, rule] of imports.entries()) css = css.replace(`.${marker}-${index}{}`, rule)
  return { css, removed: result.removed.map(restore), refusals }
}
