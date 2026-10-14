import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib'
import type { PdfAnalysis, PdfImage } from './types.ts'

const name = (dict: PDFDict, key: string): string | undefined => {
  const value = dict.lookup(PDFName.of(key))
  return value instanceof PDFName ? value.asString().slice(1) : undefined
}
const number = (dict: PDFDict, key: string): number | undefined => {
  const value = dict.lookup(PDFName.of(key))
  return value instanceof PDFNumber ? value.asNumber() : undefined
}

function imageBytes(value: string): number {
  const match = value.match(/^([\d.]+)([KMG]?)$/)
  if (!match) return 0
  const multiplier = match[2] === 'K' ? 1024 : match[2] === 'M' ? 1024 ** 2 : match[2] === 'G' ? 1024 ** 3 : 1
  return Math.round(Number(match[1]) * multiplier)
}

function listedImages(file: string): PdfImage[] {
  const result = Bun.spawnSync(['pdfimages', '-list', file], { stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`pdfimages failed: ${result.stderr.toString().trim()}`)
  return result.stdout
    .toString()
    .split('\n')
    .filter((line) => /^\s*\d+\s+\d+\s+(?:image|smask)\s+/.test(line))
    .map((line) => {
      const columns = line.trim().split(/\s+/)
      return {
        type: columns[2] ?? 'image',
        width: Number(columns[3]),
        height: Number(columns[4]),
        xDpi: Number(columns[12]),
        yDpi: Number(columns[13]),
        bytes: imageBytes(columns[14] ?? '0'),
      }
    })
}

export async function analyzePdf(file: string): Promise<PdfAnalysis> {
  const document = await PDFDocument.load(await Bun.file(file).arrayBuffer())
  const seen = new Set<unknown>()
  const shadingTypes: number[] = []
  const counts = { softMasks: 0, transparencyGroups: 0, vectorOps: false }
  const visitDictionary = (value: PDFDict): void => {
    const shading = number(value, 'ShadingType')
    if (shading) shadingTypes.push(shading)
    if (value.has(PDFName.of('SMask'))) counts.softMasks++
    const group = value.lookup(PDFName.of('Group'))
    if (group instanceof PDFDict && name(group, 'S') === 'Transparency') counts.transparencyGroups++
    for (const [, child] of value.entries()) visit(child)
  }
  const visitStream = (value: PDFRawStream): void => {
    if (name(value.dict, 'Subtype') !== 'Image') {
      try {
        const stream = new TextDecoder().decode(decodePDFRawStream(value).decode())
        counts.vectorOps ||= /(?:^|\s)(?:m|l|c|re|f|S|sh)(?:\s|$)/m.test(stream)
      } catch {}
    }
    visit(value.dict)
  }
  const visit = (value: unknown): void => {
    if (value instanceof PDFRef) {
      visit(document.context.lookup(value))
      return
    }
    if (!value || seen.has(value)) return
    seen.add(value)
    if (value instanceof PDFRawStream) {
      visitStream(value)
      return
    }
    if (value instanceof PDFDict) {
      visitDictionary(value)
      return
    }
    if (value instanceof PDFArray) for (let index = 0; index < value.size(); index++) visit(value.get(index))
  }
  for (const [, object] of document.context.enumerateIndirectObjects()) visit(object)
  return {
    vectorOps: counts.vectorOps,
    shadingTypes: [...new Set(shadingTypes)].sort(),
    images: listedImages(file),
    softMasks: counts.softMasks,
    transparencyGroups: counts.transparencyGroups,
  }
}

export async function trimPdf(source: string, destination: string): Promise<void> {
  const document = await PDFDocument.load(await Bun.file(source).arrayBuffer())
  for (const page of document.getPages()) {
    const box = page.getTrimBox()
    page.setCropBox(box.x, box.y, box.width, box.height)
  }
  await Bun.write(destination, await document.save())
}
