import { inflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { openRenderer } from '@segnavia/render'

const require = createRequire(new URL('../packages/render/package.json', import.meta.url))
const pdfLib = require('pdf-lib')
const { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFStream } = pdfLib
const PDFRef = pdfLib.PDFRef

const CHROMIUM =
  process.env.SEGNAVIA_CHROMIUM ??
  '/Users/shmuel/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const cases = {
  conic: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
  repeatingLinear: 'repeating-linear-gradient(45deg, #e03030 0 10px, #3030e0 10px 20px)',
  repeatingRadial: 'repeating-radial-gradient(circle, #e03030 0 10px, #3030e0 10px 20px)',
}

function dictDump(dict: InstanceType<typeof PDFDict>, depth = 0): string {
  const lines: string[] = []
  for (const [name, value] of dict.entries()) {
    lines.push(`${'  '.repeat(depth)}${name.toString()} ${summarize(value, depth)}`)
  }
  return lines.join('\n')
}

function summarize(value: unknown, depth: number): string {
  if (value instanceof PDFName) return value.toString()
  if (value instanceof PDFNumber) return String(value.asNumber())
  if (PDFRef && value instanceof PDFRef) return value.toString()
  if (value instanceof PDFArray) {
    const parts = []
    for (let i = 0; i < value.size(); i++) parts.push(summarize(value.get(i), depth))
    return `[${parts.join(' ')}]`
  }
  if (value instanceof PDFDict) return `<<\n${dictDump(value, depth + 1)}\n${'  '.repeat(depth)}>>`
  if (value instanceof PDFRawStream || value instanceof PDFStream) return `stream dict:\n${dictDump(value.dict, depth + 1)}`
  return Object.prototype.toString.call(value) + ' ' + String(value)
}

function decodeStream(stream: InstanceType<typeof PDFRawStream>): Uint8Array {
  const filter = stream.dict.get(PDFName.of('Filter'))
  const name = filter instanceof PDFName ? filter.toString().slice(1) : undefined
  if (name === 'FlateDecode') return inflateSync(stream.contents)
  return stream.contents
}

async function dumpOne(label: string, css: string) {
  const renderer = await openRenderer({ executablePath: CHROMIUM, concurrency: 1 })
  try {
    const html = `<!doctype html><style>
@page{size:200px 200px;margin:0}
html,body{margin:0;width:200px;height:200px}
.box{width:200px;height:200px;background:${css}}
</style><div class="box"></div>`
    const bytes = await renderer.pagePdf({ html, size: { width: 200, height: 200 } })
    writeFileSync(`/Users/shmuel/.local/state/bottega/orchestrator/runs/12259/scratch/${label}.pdf`, bytes)
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    const out: string[] = [`=== ${label}: ${css} ===`, `pdf bytes=${bytes.length}`]
    for (const [, object] of document.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict) && !(object instanceof PDFRawStream) && !(object instanceof PDFStream)) continue
      const dict = object instanceof PDFDict ? object : object.dict
      const shadingType = dict.lookupMaybe(PDFName.of('ShadingType'), PDFNumber)?.asNumber()
      const patternType = dict.lookupMaybe(PDFName.of('PatternType'), PDFNumber)?.asNumber()
      const functionType = dict.lookupMaybe(PDFName.of('FunctionType'), PDFNumber)?.asNumber()
      if (shadingType !== undefined) {
        out.push(`\nSHADING:\n${dictDump(dict)}`)
      }
      if (patternType !== undefined) {
        out.push(`\nPATTERN type ${patternType}:\n${dictDump(dict)}`)
      }
      if (functionType !== undefined) {
        out.push(`\nFUNCTION type ${functionType}:\n${dictDump(dict)}`)
        if (object instanceof PDFRawStream) {
          const decoded = decodeStream(object)
          out.push(`decoded length=${decoded.byteLength}`)
          out.push(`program:\n${new TextDecoder('latin1').decode(decoded)}`)
        }
      }
    }
    const text = out.join('\n')
    console.log(text)
    writeFileSync(`/Users/shmuel/.local/state/bottega/orchestrator/runs/12259/scratch/${label}.txt`, text)
  } finally {
    await renderer.close()
  }
}

for (const [label, css] of Object.entries(cases)) await dumpOne(label, css)
