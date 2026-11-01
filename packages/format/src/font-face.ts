import { collectionFaces, extractFace, sfntPostScriptNames } from './font-collection.ts'
import { FontFaceRefusedError } from './font-refusal.ts'
import { classifyFont } from './font-signature.ts'
import type { FontFormat } from './fonts.ts'

export interface ResolvedFontFace {
  data: Uint8Array
  format: Exclude<FontFormat, 'collection'>
}

export function resolveFontFace(data: Uint8Array, format: FontFormat, postscriptName?: string): ResolvedFontFace {
  const detected = classifyFont(data)
  if (detected === 'collection') {
    if (!postscriptName)
      throw new FontFaceRefusedError(
        `font collection requires a PostScript name; it holds ${collectionFaces(data).join(', ').slice(0, 1024) || '(none)'}; send one of those PostScript names to clear this refusal.`,
      )
    return extractFace(data, postscriptName)
  }
  if (format === 'collection')
    throw new FontFaceRefusedError('font declared as a collection does not contain a font collection; send bytes with a ttcf signature to clear this refusal.')
  if (!postscriptName || detected === 'woff' || detected === 'woff2') {
    return { data, format }
  }
  const names = sfntPostScriptNames(data)
  if (names.includes(postscriptName) && (detected === 'opentype' || detected === 'truetype')) return { data, format: detected }
  throw new FontFaceRefusedError(
    `font face has PostScript name ${names.join(', ').slice(0, 1024) || '(none)'}, not ${postscriptName}; send its matching PostScript name to clear this refusal.`,
  )
}
