import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream } from 'pdf-lib'
import { readFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) throw new Error('usage: bun scripts/probe-assign.ts <pdf>')
const bytes = readFileSync(path)
const document = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })

const typeOf = (object: unknown): string => {
  if (!object) return 'undefined'
  const ctor = (object as { constructor?: { name?: string } }).constructor?.name ?? typeof object
  if (object instanceof PDFRawStream) {
    const subtype = object.dict.get(PDFName.of('Subtype'))?.toString()
    const type = object.dict.get(PDFName.of('Type'))?.toString()
    return `PDFRawStream type=${type} subtype=${subtype} dictCtor=${object.dict.constructor.name}`
  }
  if (object instanceof PDFDict) {
    return `${ctor} Type=${object.get(PDFName.of('Type'))?.toString()}`
  }
  return ctor
}

console.log('pageCount', document.getPageCount())
for (const [ref, object] of document.context.enumerateIndirectObjects()) {
  const type = object instanceof PDFDict ? object.get(PDFName.of('Type'))?.toString() : undefined
  if (type === '/Pages' || type === '/Page' || type === '/Catalog') {
    console.log('TREE', ref.toString(), typeOf(object))
    if (type === '/Pages' && object instanceof PDFDict) {
      const kids = object.lookup(PDFName.of('Kids'))
      console.log('  Kids ctor', kids?.constructor.name, kids?.toString().slice(0, 200))
    }
  }
}

console.log('--- pages via getPages ---')
try {
  for (const page of document.getPages()) {
    const pageRef = document.context.getObjectRef(page.node)
    console.log('page.node', pageRef?.toString(), typeOf(page.node))
    const contents = page.node.get(PDFName.of('Contents'))
    console.log('  Contents raw', contents?.constructor.name, contents instanceof PDFRef ? contents.toString() : typeOf(contents))
    const looked = page.node.Contents()
    console.log('  Contents()', typeOf(looked), 'getObjectRef(contents)=', looked ? document.context.getObjectRef(looked as never)?.toString() : undefined)
    if (looked instanceof PDFRawStream) {
      console.log('  stream===page.node', looked === (page.node as never))
      console.log('  stream.dict===page.node', looked.dict === page.node)
      console.log('  getObjectRef(stream.dict)', document.context.getObjectRef(looked.dict)?.toString())
    }
    if (looked instanceof PDFStream && !(looked instanceof PDFRawStream)) {
      console.log('  PDFStream but not raw', looked.constructor.name)
    }
  }
} catch (error) {
  console.log('getPages failed', error)
}

let streamAtPage = 0
for (const [ref, object] of document.context.enumerateIndirectObjects()) {
  if (object instanceof PDFRawStream && object.dict.get(PDFName.of('Type'))?.toString() === '/Page') {
    streamAtPage++
    console.log('STREAM-WITH-PAGE-TYPE', ref.toString(), typeOf(object), 'dict registered?', document.context.getObjectRef(object.dict)?.toString())
  }
}
console.log('streamsWithPageType', streamAtPage)
