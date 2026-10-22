import { deflateSync } from 'node:zlib'
import { type PDFDocument, PDFName, type PDFObject, type PDFRawStream } from 'pdf-lib'
import { chargeOutputImageBytes } from './image-limits.ts'
import { pngPredictor } from './image-samples.ts'
import { encodeCmykJpeg } from './jpeg-encode.ts'

const key = (value: string): PDFName => PDFName.of(value)

export function emitConvertedRaster(
  state: {
    document: PDFDocument
    destination: 'cmyk' | 'gray'
    imageEncoding: 'lossless' | 'jpeg'
    imageQuality: number
    outputBytes: number
  },
  dictionary: Record<string, PDFObject>,
  samples: Uint8Array,
  width: number,
  height: number,
  channels: number,
  bits: number,
): PDFRawStream {
  if (state.imageEncoding === 'jpeg' && channels === 4) {
    const encoded = encodeCmykJpeg(width, height, samples, state.imageQuality)
    chargeOutputImageBytes(state, encoded.length, samples.length + encoded.length)
    dictionary.Filter = key('DCTDecode')
    return state.document.context.stream(encoded, dictionary)
  }
  const encoded = state.destination === 'cmyk' ? pngPredictor(samples, width, height, channels, bits) : samples
  if (state.destination === 'cmyk')
    dictionary.DecodeParms = state.document.context.obj({ Predictor: 15, Colors: channels, Columns: width, BitsPerComponent: bits })
  const compressed = deflateSync(encoded)
  chargeOutputImageBytes(state, compressed.length, encoded.length + compressed.length)
  return state.document.context.stream(compressed, dictionary)
}
