import { expect, test } from 'bun:test'
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib'
import { withDocumentMetadata, writeDocumentMetadata } from './document-metadata.ts'

const key = (value: string) => PDFName.of(value)

function xmp(document: PDFDocument): string {
  const stream = document.context.lookup(document.catalog.get(key('Metadata')))
  if (!(stream instanceof PDFRawStream)) throw new Error('The PDF has no raw XMP metadata stream.')
  return new TextDecoder().decode(stream.getContents())
}

test('writes defined fields and escaped extras through a PDF load round trip', async () => {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  writeDocumentMetadata(document, {
    title: 'Seder & Song',
    authors: ['Ada & Bob', 'David'],
    subject: 'One < two',
    lang: 'en',
    extra: { edition: 'Second & <final>' },
  })
  const loaded = await PDFDocument.load(await document.save(), { updateMetadata: false })
  const info = loaded.context.lookup(loaded.context.trailerInfo.Info, PDFDict)

  expect(loaded.getTitle()).toBe('Seder & Song')
  expect(loaded.getAuthor()).toBe('Ada & Bob; David')
  expect(loaded.getSubject()).toBe('One < two')
  expect(loaded.context.lookup(loaded.catalog.get(key('Lang')), PDFHexString).decodeText()).toBe('en')
  expect(info.lookup(key('edition'), PDFHexString).decodeText()).toBe('Second & <final>')
  expect(xmp(loaded)).toContain('<pdfx:edition>Second &amp; &lt;final&gt;</pdfx:edition>')
})

test('keeps a Hebrew title byte for byte in Info and unchanged in UTF-8 XMP', async () => {
  const title = 'הגדה של פסח'
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  writeDocumentMetadata(document, { title, lang: 'he' })
  const loaded = await PDFDocument.load(await document.save(), { updateMetadata: false })
  const info = loaded.context.lookup(loaded.context.trailerInfo.Info, PDFDict)
  const encoded = info.lookup(key('Title'), PDFHexString)

  expect(loaded.getTitle()).toBe(title)
  expect(new TextEncoder().encode(loaded.getTitle() ?? '')).toEqual(new TextEncoder().encode(title))
  expect([...encoded.asBytes()].slice(0, 2)).toEqual([0xfe, 0xff])
  expect(xmp(loaded)).toContain(`<rdf:li xml:lang="he">${title}</rdf:li>`)
})

test('removes Chromium placeholder title when page metadata is omitted', async () => {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  document.setTitle('about:blank')

  const loaded = await PDFDocument.load(await withDocumentMetadata(await document.save()), { updateMetadata: false })

  expect(loaded.getTitle()).toBeUndefined()
})
