import {
  APP_FONT_NAME,
  type AppFont,
  type BookView,
  type FontDeclaration,
  type FontFace,
  type FontFailure,
  type FontManifest,
  type FontReference,
  type FontSource,
  matchFaces,
  type Page,
} from '@segnavia/format'
import { fontCss } from '@segnavia/html'
import { FONT_FAILURE_LIMIT } from './font-load.ts'

export interface FontsOptions {
  source: FontSource
  local?: FontFace[]
}

export interface ResolvedFonts {
  css: string
  failures: FontFailure[]
}

export class FontRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FontRefusedError'
  }
}

export function uniqueFontReferences(references: FontReference[]): FontReference[] {
  const seen = new Set<string>()
  const unique: FontReference[] = []
  for (const ref of references) {
    const key = JSON.stringify(ref)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(ref)
  }
  return unique
}

export function appNames(references: FontReference[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const ref of references) {
    const name = 'app' in ref ? ref.app : ref.fallback
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

export function fontManifestReferences(fonts: FontManifest | undefined): FontReference[] {
  return Object.entries(fonts ?? {}).map(([name, declaration]) => ('local' in declaration ? declaration : { app: name }))
}

export function fontManifestWithReferences(fonts: FontManifest | undefined, references: readonly FontReference[]): FontManifest {
  const merged: FontManifest = { ...fonts }
  for (const reference of references) {
    if ('app' in reference) merged[reference.app] ??= { faces: [] }
    else if (!Object.values(merged).some((entry) => 'local' in entry && entry.local === reference.local && entry.fallback === reference.fallback)) {
      merged[`local-${Object.keys(merged).length}`] = reference
    }
  }
  return merged
}

export function refuseMissingFontSource(fonts: FontManifest | FontReference[], place: string): void {
  const references = Array.isArray(fonts) ? fonts : fontManifestReferences(fonts)
  const name = appNames(references)[0]
  if (!name) return
  throw new FontRefusedError(`${place} could not establish app font ${JSON.stringify(name)}; supply a FontSource to clear this refusal.`)
}

export function requireAppFontName(name: string, place: string): void {
  if (APP_FONT_NAME.test(name)) return
  throw new FontRefusedError(
    `${place} could not establish an app font name matching ${APP_FONT_NAME} (${JSON.stringify(name)}); use a lowercase name of letters, digits and hyphens to clear this refusal.`,
  )
}

function unsupplied(font: string, family: string, faces: readonly FontDeclaration[]): FontFailure[] {
  return faces.map(({ script: _script, ...face }) => ({ font, family, ...face, reason: 'unsupplied' as const }))
}

export async function resolveFontReferences(declarations: FontManifest, fonts: FontsOptions, signal: AbortSignal, place: string): Promise<ResolvedFonts> {
  const app = new Map<string, AppFont>()
  const failures: FontFailure[] = []
  const appDeclarations = new Map<string, { faces: FontDeclaration[]; generic?: AppFont['generic'] }>()
  for (const [name, declaration] of Object.entries(declarations)) {
    if ('faces' in declaration) appDeclarations.set(name, declaration)
    else if (!appDeclarations.has(declaration.fallback)) appDeclarations.set(declaration.fallback, { faces: [] })
  }
  for (const [name, declaration] of appDeclarations) {
    requireAppFontName(name, place)
    const font = await fonts.source.font(name, { signal })
    signal.throwIfAborted()
    if (!font) {
      failures.push(...unsupplied(name, name, declaration.faces.length > 0 ? declaration.faces : [{}]))
      continue
    }
    const matched = matchFaces(declaration.faces, font.faces)
    failures.push(...unsupplied(name, font.family, matched.unsupplied))
    app.set(name, { ...font, faces: matched.faces, generic: declaration.generic ?? font.generic })
  }
  return { css: fontCss({ app, local: fonts.local ?? [] }), failures: failures.slice(0, FONT_FAILURE_LIMIT) }
}

export async function resolvePageFonts(
  page: Pick<Page, 'id' | 'style'>,
  motifFonts: FontReference[],
  fonts: FontsOptions,
  signal: AbortSignal,
): Promise<ResolvedFonts> {
  const place = page.id ? `page ${JSON.stringify(page.id)}` : 'page'
  return resolveFontReferences(fontManifestWithReferences(page.style?.fonts, motifFonts), fonts, signal, place)
}

export async function pageFontCss(
  page: Pick<Page, 'id' | 'style'>,
  motifFonts: FontReference[],
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<ResolvedFonts> {
  const place = page.id ? `page ${JSON.stringify(page.id)}` : 'page'
  const declarations = fontManifestWithReferences(page.style?.fonts, motifFonts)
  if (!fonts) {
    refuseMissingFontSource(declarations, place)
    return { css: '', failures: [] }
  }
  return resolveFontReferences(declarations, fonts, signal, place)
}

export async function expandedPagesFontCss(
  expanded: ReadonlyArray<{ page: Pick<Page, 'style'>; fonts: FontReference[] }>,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
  place = 'page',
): Promise<ResolvedFonts> {
  const declarations: FontManifest = {}
  for (const item of expanded) Object.assign(declarations, item.page.style?.fonts, fontManifestWithReferences(undefined, item.fonts))
  if (!fonts) {
    refuseMissingFontSource(declarations, place)
    return { css: '', failures: [] }
  }
  return resolveFontReferences(declarations, fonts, signal, place)
}

export async function expandedBookFontCss(
  expanded: { book: BookView; fonts: FontReference[] },
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<ResolvedFonts> {
  const place = expanded.book.title ? `book ${JSON.stringify(expanded.book.title)}` : 'book'
  const declarations = fontManifestWithReferences(expanded.book.style?.fonts, expanded.fonts)
  if (!fonts) {
    refuseMissingFontSource(declarations, place)
    return { css: '', failures: [] }
  }
  return resolveFontReferences(declarations, fonts, signal, place)
}

export const DEFAULT_NOTES_FONT_FAMILY = 'sans-serif'
export const NOTES_FONT_PLACE = 'notes'

export function notesSheetFontFamily(name: string | undefined): string {
  if (name === undefined) return DEFAULT_NOTES_FONT_FAMILY
  requireAppFontName(name, NOTES_FONT_PLACE)
  return `var(--segnavia-font-${name})`
}

export async function resolveNotesFontCss(
  name: string | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<{ family: string; css: string; failures: FontFailure[] }> {
  if (name === undefined) return { family: DEFAULT_NOTES_FONT_FAMILY, css: '', failures: [] }
  requireAppFontName(name, NOTES_FONT_PLACE)
  const declarations: FontManifest = { [name]: { faces: [] } }
  if (!fonts) {
    refuseMissingFontSource(declarations, NOTES_FONT_PLACE)
    return { family: notesSheetFontFamily(name), css: '', failures: [] }
  }
  return { family: notesSheetFontFamily(name), ...(await resolveFontReferences(declarations, fonts, signal, NOTES_FONT_PLACE)) }
}
