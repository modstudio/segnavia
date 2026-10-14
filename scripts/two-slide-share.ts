import { createRequire } from 'node:module'
import { openRenderer } from '@segnavia/render'

const CHROMIUM =
  process.env.SEGNAVIA_CHROMIUM ??
  '/Users/shmuel/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const renderRequire = createRequire(new URL('../packages/render/package.json', import.meta.url))
const { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } = renderRequire('pdf-lib')

const html = `<div style="height:160px;background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red)"></div>`
const renderer = await openRenderer({ executablePath: CHROMIUM, concurrency: 1, jsHeapMb: 128 })
try {
  const bytes = await renderer.deckPdf({
    title: 'Share',
    size: { width: 600, height: 400 },
    scripts: 'refuse',
    slides: [
      { id: 'a', content: { kind: 'html', html } },
      { id: 'b', content: { kind: 'html', html } },
    ],
  })
  const document = await PDFDocument.load(bytes)
  const patterns: string[] = []
  const functions: string[] = []
  const shadings: string[] = []
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    const dict = object instanceof PDFRawStream ? object.dict : object instanceof PDFDict ? object : undefined
    if (!dict) continue
    const label = ref.toString()
    if (dict.lookup(PDFName.of('PatternType'))?.toString() === '2') patterns.push(label)
    if (dict.lookup(PDFName.of('FunctionType'))?.toString() === '4') functions.push(label)
    if (dict.has(PDFName.of('ShadingType'))) {
      const fn = dict.get(PDFName.of('Function'))
      shadings.push(`${label} fn=${fn instanceof PDFRef ? fn.toString() : typeof fn}`)
    }
  }
  console.log(`pages=${document.getPageCount()}`)
  console.log(`patternType2=${patterns.length} refs=${patterns.join(',')}`)
  console.log(`functionType4=${functions.length} refs=${functions.join(',')}`)
  console.log(`shadings=${shadings.join(' | ')}`)
} finally {
  await renderer.close()
}
