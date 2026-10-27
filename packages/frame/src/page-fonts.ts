import type { AppFont, FontFace, FontReference, FontSource, Page } from '@segnavia/format'
import { APP_FONT_NAME } from '@segnavia/format'
import { fontCss } from '@segnavia/html'

export interface FontsOptions {
  source: FontSource
  local?: FontFace[]
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

function appNames(references: FontReference[]): string[] {
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

function declaredAppFont(references: FontReference[]): string | undefined {
  for (const ref of references) {
    if ('app' in ref) return ref.app
  }
}

export function refuseMissingFontSource(references: FontReference[], place: string): void {
  const name = declaredAppFont(references)
  if (!name) return
  throw new FontRefusedError(`${place} could not establish app font ${JSON.stringify(name)}; supply a FontSource to clear this refusal.`)
}

function requireAppFontName(name: string, place: string): void {
  if (APP_FONT_NAME.test(name)) return
  throw new FontRefusedError(
    `${place} could not establish an app font name matching ${APP_FONT_NAME} (${JSON.stringify(name)}); use a lowercase name of letters, digits and hyphens to clear this refusal.`,
  )
}

export async function resolveFontReferences(references: FontReference[], fonts: FontsOptions, signal: AbortSignal, place: string): Promise<string> {
  const app = new Map<string, AppFont>()
  for (const name of appNames(references)) {
    requireAppFontName(name, place)
    const font = await fonts.source.font(name, { signal })
    signal.throwIfAborted()
    if (!font) {
      throw new FontRefusedError(
        `${place} could not establish app font ${JSON.stringify(name)}; make that font available from the source to clear this refusal.`,
      )
    }
    app.set(name, font)
  }
  return fontCss({ app, local: fonts.local ?? [] })
}

export async function resolvePageFonts(page: Page, motifFonts: FontReference[], fonts: FontsOptions, signal: AbortSignal): Promise<string> {
  const place = page.id ? `page ${JSON.stringify(page.id)}` : 'page'
  return resolveFontReferences(uniqueFontReferences([...(page.fonts ?? []), ...motifFonts]), fonts, signal, place)
}

export async function pageFontCss(page: Page, motifFonts: FontReference[], fonts: FontsOptions | undefined, signal: AbortSignal): Promise<string> {
  const place = page.id ? `page ${JSON.stringify(page.id)}` : 'page'
  const references = uniqueFontReferences([...(page.fonts ?? []), ...motifFonts])
  if (!fonts) {
    refuseMissingFontSource(references, place)
    return ''
  }
  return resolveFontReferences(references, fonts, signal, place)
}

export async function expandedPagesFontCss(
  expanded: ReadonlyArray<{ page: Page; fonts: FontReference[] }>,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
  place = 'page',
): Promise<string> {
  const references = uniqueFontReferences([...expanded.flatMap((item) => item.page.fonts ?? []), ...expanded.flatMap((item) => item.fonts)])
  if (!fonts) {
    refuseMissingFontSource(references, place)
    return ''
  }
  return resolveFontReferences(references, fonts, signal, place)
}
