import type { AppFont, FontFace as FontFaceData, FontReference } from '@segnavia/format'
import type { FontsOptions } from './page-fonts.ts'
import { refuseMissingFontSource } from './page-fonts.ts'

function appNames(references: FontReference[]): string[] {
  return [...new Set(references.map((reference) => ('app' in reference ? reference.app : reference.fallback)))]
}

function nativeFace(face: FontFaceData): FontFace {
  const descriptors: FontFaceDescriptors = {}
  if (face.weight !== undefined) descriptors.weight = String(face.weight)
  if (face.style !== undefined) descriptors.style = face.style
  if (face.unicodeRange !== undefined) descriptors.unicodeRange = face.unicodeRange
  return new FontFace(face.family, new Uint8Array(face.data).buffer, descriptors)
}

export async function registerMarkdownEditorFonts(
  element: HTMLElement,
  references: FontReference[],
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<() => void> {
  if (!fonts) {
    refuseMissingFontSource(references, 'markdown editor')
    return () => undefined
  }
  const app = new Map<string, AppFont>()
  for (const name of appNames(references)) {
    const resolved = await fonts.source.font(name, { signal })
    signal.throwIfAborted()
    if (!resolved)
      throw new Error(`markdown editor could not establish app font ${JSON.stringify(name)}; make that font available from the source to clear this refusal.`)
    app.set(name, resolved)
    element.style.setProperty(`--segnavia-font-${name}`, `${JSON.stringify(resolved.family)},${resolved.generic ?? 'sans-serif'}`)
  }
  const loaded: FontFace[] = []
  for (const face of [...app.values()].flatMap((font) => font.faces).concat(fonts.local ?? [])) {
    const native = nativeFace(face)
    await native.load()
    signal.throwIfAborted()
    document.fonts.add(native)
    loaded.push(native)
  }
  return () => {
    for (const face of loaded) document.fonts.delete(face)
    for (const name of app.keys()) element.style.removeProperty(`--segnavia-font-${name}`)
  }
}
