import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from 'pdf-lib'
import type { GoldenOutlineItem, GoldenPdf } from './model.ts'

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
  const volatile = new Set(['CreationDate', 'ModDate', 'File size'])
  for (const line of run('pdfinfo', [file]).split('\n')) {
    const match = /^([^:]+):\s*(.*)$/.exec(line)
    if (!match || volatile.has(match[1] as string)) continue
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

function embeddedFonts(file: string): string[] {
  return parsePdfFonts(run('pdffonts', [file]))
}

const resolve = (document: PDFDocument, value: unknown) => (value instanceof PDFRef ? document.context.lookup(value) : value)

function text(value: unknown): string | undefined {
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined
}

function outline(document: PDFDocument): GoldenOutlineItem[] {
  const output: GoldenOutlineItem[] = []
  const visit = (value: unknown, depth: number): void => {
    let current = resolve(document, value)
    while (current instanceof PDFDict) {
      const title = text(resolve(document, current.get(PDFName.of('Title'))))
      const target = resolve(document, current.get(PDFName.of('Dest')))
      if (title !== undefined && target instanceof PDFArray) {
        const reference = target.get(0)
        const page = document.getPages().findIndex((candidate) => candidate.ref.toString() === reference?.toString()) + 1
        output.push({ title, page, depth })
      }
      visit(current.get(PDFName.of('First')), depth + 1)
      current = resolve(document, current.get(PDFName.of('Next')))
    }
  }
  const outlines = resolve(document, document.catalog.get(PDFName.of('Outlines')))
  if (outlines instanceof PDFDict) visit(outlines.get(PDFName.of('First')), 0)
  return output
}

export async function readGoldenPdf(file: string): Promise<GoldenPdf> {
  const document = await PDFDocument.load(readFileSync(file), { updateMetadata: false })
  const sizes = pageSizes(file)
  const extracted = run('pdftotext', ['-enc', 'UTF-8', file, '-']).split('\f')
  if (extracted.at(-1)?.trim() === '') extracted.pop()
  if (extracted.length !== sizes.length) throw new Error(`pdftotext reported ${extracted.length} pages for ${file}; expected ${sizes.length}.`)
  return {
    pages: sizes.map((size, index) => ({ size, text: normalizedText(extracted[index] as string) })),
    outline: outline(document),
    fonts: embeddedFonts(file),
    info: infoFields(file),
    xmp: normalizedText(run('pdfinfo', ['-meta', file])),
  }
}
