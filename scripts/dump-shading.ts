import { inflateSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { openRenderer } from '@segnavia/render'

const require = createRequire(new URL('../packages/render/package.json', import.meta.url))
const { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } = require('pdf-lib')

const CHROMIUM =
  process.env.SEGNAVIA_CHROMIUM ??
  '/Users/shmuel/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const html = `<body style="margin:20px;display:grid;grid-template-columns:repeat(2,260px);gap:16px">
<div style="height:160px;background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red)"></div>
<div style="height:160px;background:repeating-linear-gradient(45deg,#e03030 0 10px,#3030e0 10px 20px)"></div>
<div style="height:160px;background:repeating-radial-gradient(circle,#20a060 0 8px,#f0c020 8px 16px)"></div>
<div style="height:160px;background:conic-gradient(from 90deg,#333,#fff)"></div></body>`

function nameOf(object: unknown) {
  return object instanceof PDFName ? object.toString().slice(1) : undefined
}
function numberOf(dict: InstanceType<typeof PDFDict>, key: string) {
  const v = dict.lookupMaybe(PDFName.of(key), PDFNumber)
  return v?.asNumber()
}
function nums(dict: InstanceType<typeof PDFDict>, key: string) {
  const a = dict.lookupMaybe(PDFName.of(key), PDFArray)
  if (!a) return undefined
  return Array.from({ length: a.size() }, (_, i) => a.lookupMaybe(i, PDFNumber)?.asNumber())
}
function resolved(doc: InstanceType<typeof PDFDocument>, object: unknown) {
  return object instanceof PDFRef ? doc.context.lookup(object) : object
}

const renderer = await openRenderer({ executablePath: CHROMIUM, concurrency: 1 })
try {
  const bytes = await renderer.pagePdf({ html, scripts: 'refuse', size: { width: 600, height: 400 } }, { waitForPageReady: false })
  console.log('pdf bytes', bytes.length)
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  for (const page of document.getPages()) {
    console.log('page size', page.getSize())
    console.log('MediaBox', page.node.MediaBox()?.toString())
    console.log('CropBox', page.node.CropBox()?.toString())
    const contents = page.node.Contents()
    const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
    for (const object of objects) {
      const stream = resolved(document, object)
      if (stream instanceof PDFRawStream) {
        const filter = nameOf(stream.dict.get(PDFName.of('Filter')))
        let data = stream.contents
        if (filter === 'FlateDecode') data = inflateSync(data)
        console.log('content:\n', new TextDecoder('latin1').decode(data))
      }
    }
    const resources = page.node.Resources()
    console.log('resources keys', resources ? [...resources.keys()].map((k) => k.toString()) : [])
  }
  let i = 0
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) && !(object instanceof PDFRawStream)) continue
    const dict = object instanceof PDFRawStream ? object.dict : object
    if (numberOf(dict, 'PatternType') === 2) {
      i++
      console.log('\n=== Pattern', i, '===')
      console.log('Matrix', nums(dict, 'Matrix'))
      console.log('Pattern keys', [...dict.keys()].map((k) => k.toString()))
      const shadingObj = resolved(document, dict.get(PDFName.of('Shading')))
      const shading = shadingObj instanceof PDFRawStream ? shadingObj.dict : shadingObj
      if (shading instanceof PDFDict) dumpShading(document, shading)
    }
  }
} finally {
  await renderer.close()
}

function dumpShading(document: InstanceType<typeof PDFDocument>, shading: InstanceType<typeof PDFDict>) {
  console.log('ShadingType', numberOf(shading, 'ShadingType'))
  console.log('ColorSpace', shading.get(PDFName.of('ColorSpace'))?.toString())
  console.log('Domain', nums(shading, 'Domain'))
  console.log('Matrix', nums(shading, 'Matrix'))
  console.log('BBox', nums(shading, 'BBox'))
  console.log('Extend', nums(shading, 'Extend'))
  console.log('Background', nums(shading, 'Background'))
  const fnObj = resolved(document, shading.get(PDFName.of('Function')))
  const fnDict = fnObj instanceof PDFRawStream ? fnObj.dict : fnObj
  if (!(fnDict instanceof PDFDict)) {
    console.log('Function missing')
    return
  }
  console.log('FunctionType', numberOf(fnDict, 'FunctionType'))
  console.log('Fn Domain', nums(fnDict, 'Domain'))
  console.log('Fn Range', nums(fnDict, 'Range'))
  console.log('Fn Size', nums(fnDict, 'Size'))
  console.log('Fn BitsPerSample', numberOf(fnDict, 'BitsPerSample'))
  if (fnObj instanceof PDFRawStream) {
    const filter = nameOf(fnObj.dict.get(PDFName.of('Filter')))
    let data = fnObj.contents
    if (filter === 'FlateDecode') data = inflateSync(data)
    const text = new TextDecoder('latin1').decode(data)
    console.log('Fn stream length', data.length)
    console.log('Fn program:\n', text)
  }
}
