import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { pdfOutlineItems, resolve } from '../book-pdf-readback.ts'
import type { GoldenPdf } from './model.ts'

const run = (command: string, arguments_: string[]): string => execFileSync(command, arguments_, { encoding: 'utf8' }).replaceAll('\r\n', '\n')
const normalizedText = (value: string): string =>
  value
    .normalize('NFC')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()

function pageSizes(file: string): [number, number][] {
  const info = run('pdfinfo', ['-box', file])
  const count = Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1])
  if (!Number.isInteger(count)) throw new Error(`pdfinfo did not report a page count for ${file}.`)
  const detailed = run('pdfinfo', ['-box', '-f', '1', '-l', String(count), file])
  const sizes = [...detailed.matchAll(/^Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts(?: .*)?$/gm)].map((match): [number, number] => [
    Number(match[1]),
    Number(match[2]),
  ])
  if (sizes.length !== count) throw new Error(`pdfinfo reported ${count} pages but ${sizes.length} page sizes for ${file}.`)
  return sizes
}

function infoFields(file: string): Record<string, string> {
  const output: Record<string, string> = {}
  // Page count and geometry live in the typed pages record.
  const excluded = new Set(['CreationDate', 'ModDate', 'File size', 'Pages', 'Page size', 'Page rot'])
  for (const line of run('pdfinfo', [file]).split('\n')) {
    const match = /^([^:]+):\s*(.*)$/.exec(line)
    if (!match || excluded.has(match[1] as string)) continue
    const key = match[1] as string
    const value = match[2] as string
    output[key] = key === 'Creator' && value.includes('HeadlessChrome/') ? 'HeadlessChrome' : value.replace(/Skia\/PDF m\d+/, 'Skia/PDF')
  }
  return output
}

export function parsePdfFonts(output: string): string[] {
  const fonts = output
    .split('\n')
    .slice(2)
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const trailing = /\s(yes|no)\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.exec(line)
      if (!trailing) throw new Error(`pdffonts row has an unrecognized ending: ${line}`)
      if (trailing[1] !== 'yes') return []
      return [
        line
          .trimStart()
          .split(/\s/, 1)[0]
          ?.replace(/^[A-Z]{6}\+/, '') ?? '',
      ]
    })
  return [...new Set(fonts)].sort()
}

export function pdfStructureHeadingLevels(document: PDFDocument): number[] {
  const levels: number[] = []
  const visit = (value: unknown): void => {
    const object = resolve(document, value)
    if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index += 1) visit(object.get(index))
      return
    }
    if (!(object instanceof PDFDict)) return
    const role = resolve(document, object.get(PDFName.of('S')))
    const level = role instanceof PDFName ? /^H([1-6])$/.exec(role.asString().slice(1))?.[1] : undefined
    if (level !== undefined) levels.push(Number(level))
    visit(object.get(PDFName.of('K')))
  }
  const root = resolve(document, document.catalog.get(PDFName.of('StructTreeRoot')))
  if (root instanceof PDFDict) visit(root.get(PDFName.of('K')))
  return levels
}

function embeddedFonts(file: string): string[] {
  return parsePdfFonts(run('pdffonts', [file]))
}

export async function readGoldenPdf(file: string): Promise<GoldenPdf> {
  const document = await PDFDocument.load(readFileSync(file), { updateMetadata: false })
  const markInfo = document.catalog.lookupMaybe(PDFName.of('MarkInfo'), PDFDict)
  const sizes = pageSizes(file)
  const extracted = run('pdftotext', ['-enc', 'UTF-8', file, '-']).split('\f')
  if (extracted.at(-1)?.trim() === '') extracted.pop()
  if (extracted.length !== sizes.length) throw new Error(`pdftotext reported ${extracted.length} pages for ${file}; expected ${sizes.length}.`)
  return {
    pages: sizes.map((size, index) => ({ size, text: normalizedText(extracted[index] as string) })),
    outline: pdfOutlineItems(document),
    structure: {
      tree: document.catalog.has(PDFName.of('StructTreeRoot')),
      marked: markInfo?.lookupMaybe(PDFName.of('Marked'), PDFBool) === PDFBool.True,
    },
    fonts: embeddedFonts(file),
    info: infoFields(file),
    xmp: normalizedText(run('pdfinfo', ['-meta', file])),
  }
}
