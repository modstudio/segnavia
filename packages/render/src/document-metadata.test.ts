import { expect, test } from 'bun:test'
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib'
import { withDocumentMetadata, writeDocumentMetadata } from './document-metadata.ts'
import { RenderRefusedError } from './errors.ts'

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
    authors: ['David "Levy"', 'Ada'],
    subject: "One's > two",
    lang: 'en',
    extra: { edition: 'Second & <final>' },
  })
  const loaded = await PDFDocument.load(await document.save(), { updateMetadata: false })
  const info = loaded.context.lookup(loaded.context.trailerInfo.Info, PDFDict)

  expect(loaded.getTitle()).toBe('Seder & Song')
  expect(loaded.getAuthor()).toBe('David "Levy"; Ada')
  expect(loaded.getSubject()).toBe("One's > two")
  expect(loaded.context.lookup(loaded.catalog.get(key('Lang')), PDFHexString).decodeText()).toBe('en')
  expect(info.lookup(key('edition'), PDFHexString).decodeText()).toBe('Second & <final>')
  const packet = xmp(loaded)
  expect(packet).toContain('<rdf:li xml:lang="x-default">Seder &amp; Song</rdf:li>')
  expect(packet).toContain('<rdf:li>David &quot;Levy&quot;</rdf:li>')
  expect(packet).toContain('<rdf:li xml:lang="x-default">One&apos;s &gt; two</rdf:li>')
  expect(packet).toContain('<pdfx:edition>Second &amp; &lt;final&gt;</pdfx:edition>')
})

test('keeps a Hebrew title byte for byte in Info and escapes it in UTF-8 XMP', async () => {
  const title = 'הגדה & <פסח>'
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  writeDocumentMetadata(document, { title, lang: 'he' })
  const loaded = await PDFDocument.load(await document.save(), { updateMetadata: false })
  const info = loaded.context.lookup(loaded.context.trailerInfo.Info, PDFDict)
  const encoded = info.lookup(key('Title'), PDFHexString)

  expect(loaded.getTitle()).toBe(title)
  expect(new TextEncoder().encode(loaded.getTitle() ?? '')).toEqual(new TextEncoder().encode(title))
  expect([...encoded.asBytes()].slice(0, 2)).toEqual([0xfe, 0xff])
  expect(xmp(loaded)).toContain('<rdf:li xml:lang="he">הגדה &amp; &lt;פסח&gt;</rdf:li>')
})

test('omits empty authors from Info and XMP', async () => {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  writeDocumentMetadata(document, { title: 'Seder', authors: [] })
  const loaded = await PDFDocument.load(await document.save(), { updateMetadata: false })

  expect(loaded.getAuthor()).toBeUndefined()
  expect(xmp(loaded)).not.toContain('<dc:creator>')
})

test('refuses a missing Info dictionary with a named remedy', async () => {
  const document = await PDFDocument.create({ updateMetadata: false })
  const setTitle = document.setTitle.bind(document)
  document.setTitle = (title) => {
    setTitle(title)
    document.context.trailerInfo.Info = undefined
  }

  expect(() => writeDocumentMetadata(document, { title: 'Seder' })).toThrow(RenderRefusedError)
  expect(() => writeDocumentMetadata(document, { title: 'Seder' })).toThrow('Render the page again through this renderer to clear this refusal')
})

test('removes Chromium placeholder title when page metadata is omitted', async () => {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  document.setTitle('about:blank')

  const loaded = await PDFDocument.load(await withDocumentMetadata(await document.save()), { updateMetadata: false })

  expect(loaded.getTitle()).toBeUndefined()
})

test('preserves an authored title when page metadata is omitted', async () => {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  document.setTitle('Author title')

  const loaded = await PDFDocument.load(await withDocumentMetadata(await document.save()), { updateMetadata: false })

  expect(loaded.getTitle()).toBe('Author title')
})
