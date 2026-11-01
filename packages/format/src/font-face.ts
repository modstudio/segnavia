import { collectionFaces, extractFace, sfntPostScriptNames } from './font-collection.ts'
import type { FontFormat } from './fonts.ts'

export interface ResolvedFontFace {
  data: Uint8Array
  format: Exclude<FontFormat, 'collection'>
}

function signature(bytes: Uint8Array): string {
  return String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0)
}

export function resolveFontFace(data: Uint8Array, format: FontFormat, postscriptName?: string): ResolvedFontFace {
  if (signature(data) === 'ttcf') {
    if (!postscriptName) throw new Error(`font collection requires a PostScript name; it holds ${collectionFaces(data).join(', ')}`)
    return extractFace(data, postscriptName)
  }
  if (!postscriptName || signature(data) === 'wOFF' || signature(data) === 'wOF2') {
    if (format === 'collection') throw new Error('font declared as a collection does not contain a font collection')
    return { data, format }
  }
  const names = sfntPostScriptNames(data)
  if (names.includes(postscriptName)) return { data, format: signature(data) === 'OTTO' ? 'opentype' : 'truetype' }
  throw new Error(`font face has PostScript name ${names.join(', ') || '(none)'}, not ${postscriptName}`)
}
