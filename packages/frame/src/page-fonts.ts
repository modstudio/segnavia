import type { AppFont, FontFace, FontReference, FontSource, Page } from '@segnavia/format'
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

export async function resolveFontReferences(references: FontReference[], fonts: FontsOptions, signal: AbortSignal, place: string): Promise<string> {
  const app = new Map<string, AppFont>()
  for (const name of appNames(references)) {
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
  if (!fonts) return ''
  return resolvePageFonts(page, motifFonts, fonts, signal)
}

export async function expandedPagesFontCss(
  expanded: ReadonlyArray<{ page: Page; fonts: FontReference[] }>,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
  place = 'page',
): Promise<string> {
  if (!fonts) return ''
  return resolveFontReferences(
    uniqueFontReferences([...expanded.flatMap((item) => item.page.fonts ?? []), ...expanded.flatMap((item) => item.fonts)]),
    fonts,
    signal,
    place,
  )
}
