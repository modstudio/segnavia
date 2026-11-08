import { type AppFont, type FontFace as FontFaceData, fontManifestWithReferences, type FontReference } from '@segnavia/format'
import { appNames, FontRefusedError, type FontsOptions, refuseMissingFontSource, requireAppFontName, uniqueFontReferences } from '@segnavia/frame/fonts'

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
  const unique = uniqueFontReferences(references)
  if (!fonts) {
    const converted = fontManifestWithReferences(undefined, unique)
    refuseMissingFontSource(converted.manifest, converted.undeclared, 'markdown editor')
    return () => undefined
  }
  const app = new Map<string, AppFont>()
  const loaded: FontFace[] = []
  const properties: string[] = []
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    for (const face of loaded) document.fonts.delete(face)
    for (const property of properties) element.style.removeProperty(property)
  }
  signal.addEventListener('abort', cleanup, { once: true })
  try {
    for (const name of appNames(unique)) {
      requireAppFontName(name, 'markdown editor')
      const resolved = await fonts.source.font(name, { signal })
      signal.throwIfAborted()
      if (!resolved)
        throw new FontRefusedError(
          `markdown editor could not establish app font ${JSON.stringify(name)}; make that font available from the source to clear this refusal.`,
        )
      app.set(name, resolved)
      const property = `--segnavia-font-${name}`
      element.style.setProperty(property, `${JSON.stringify(resolved.family)},${resolved.generic ?? 'sans-serif'}`)
      properties.push(property)
    }
    for (const face of [...app.values()].flatMap((font) => font.faces).concat(fonts.local ?? [])) {
      const native = nativeFace(face)
      await native.load()
      signal.throwIfAborted()
      document.fonts.add(native)
      loaded.push(native)
    }
    signal.throwIfAborted()
  } catch (error) {
    cleanup()
    throw error
  }
  return () => {
    signal.removeEventListener('abort', cleanup)
    cleanup()
  }
}
