import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib'

export async function pageContentScale(pdf: Uint8Array, page = 0): Promise<number> {
  const document = await PDFDocument.load(pdf)
  const contents = document.getPage(page).node.get(PDFName.of('Contents'))
  const resolve = (value: unknown) => (value instanceof PDFRef ? document.context.lookup(value) : value)
  const resolved = resolve(contents)
  const streams = resolved instanceof PDFArray ? Array.from({ length: resolved.size() }, (_, index) => resolve(resolved.get(index))) : [resolved]
  const content = streams
    .map((stream) => {
      if (!(stream instanceof PDFRawStream)) throw new Error('A rendered PDF page has an unsupported content stream.')
      return new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode())
    })
    .join('\n')
  const scales = [...content.matchAll(/(?:^|\n)([-.\d]+) ([-.\d]+) ([-.\d]+) ([-.\d]+) [-.\d]+ [-.\d]+ cm/g)].map((match) => {
    const [, a, b, c, d] = match.map(Number)
    return Math.sqrt(Math.abs((a ?? Number.NaN) * (d ?? Number.NaN) - (b ?? Number.NaN) * (c ?? Number.NaN)))
  })
  return scales.find((scale) => scale > 1) ?? Number.NaN
}
