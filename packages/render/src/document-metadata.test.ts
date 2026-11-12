import { expect, test } from 'bun:test'
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFString } from 'pdf-lib'
import { withDocumentMetadata, writeDocumentMetadata } from './document-metadata.ts'
import type { OutputDate } from './output-date.ts'

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
  expect(packet).not.toContain('xap/1.0')
  expect(packet).toContain('<rdf:li xml:lang="x-default">Seder &amp; Song</rdf:li>')
  expect(packet).toContain('<rdf:li>David &quot;Levy&quot;</rdf:li>')
  expect(packet).toContain('<rdf:li xml:lang="x-default">One&apos;s &gt; two</rdf:li>')
  expect(packet).toContain('<pdfx:edition>Second &amp; &lt;final&gt;</pdfx:edition>')
})

test('keeps a Hebrew title byte for byte in Info and escapes it in UTF-8 XMP', async () => {
  const title = 'הגדה & <פסח>'
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  writeDocumentMetadata(document, { title, lang: 'he' }, { kind: 'date', date: '2026-11-14' })
  const loaded = await PDFDocument.load(await document.save(), { updateMetadata: false })
  const info = loaded.context.lookup(loaded.context.trailerInfo.Info, PDFDict)
  const encoded = info.lookup(key('Title'), PDFHexString)

  expect(loaded.getTitle()).toBe(title)
  expect(new TextEncoder().encode(loaded.getTitle() ?? '')).toEqual(new TextEncoder().encode(title))
  expect([...encoded.asBytes()].slice(0, 2)).toEqual([0xfe, 0xff])
  expect(xmp(loaded)).toContain('<rdf:li xml:lang="he">הגדה &amp; &lt;פסח&gt;</rdf:li>')
  expect(xmp(loaded)).toContain('<xmp:CreateDate>2026-11-14</xmp:CreateDate>')
})

test('marks Hebrew descriptive metadata for an LTR document and leaves it unmarked for RTL', async () => {
  const metadata = { title: 'שלום', authors: ['מחברת'], subject: 'נושא', lang: 'en' }
  const ltr = await PDFDocument.create({ updateMetadata: false })
  ltr.addPage()
  writeDocumentMetadata(ltr, metadata)
  expect(ltr.getTitle()).toBe('\u200eשלום')
  expect(ltr.getAuthor()).toBe('\u200eמחברת')
  expect(ltr.getSubject()).toBe('\u200eנושא')
  expect(xmp(ltr)).toContain('\u200eשלום')

  const rtl = await PDFDocument.create({ updateMetadata: false })
  rtl.addPage()
  writeDocumentMetadata(rtl, { ...metadata, lang: 'he' })
  expect(rtl.getTitle()).toBe('שלום')
  expect(rtl.getAuthor()).toBe('מחברת')
  expect(rtl.getSubject()).toBe('נושא')
})

test('marks metadata against the supplied page direction', async () => {
  const source = await PDFDocument.create({ updateMetadata: false })
  source.addPage()
  const pdf = await source.save()

  const rtl = await PDFDocument.load(await withDocumentMetadata(pdf, { title: 'English title' }, undefined, 'rtl'), { updateMetadata: false })
  expect(rtl.getTitle()).toBe('\u200fEnglish title')

  const ltr = await PDFDocument.load(await withDocumentMetadata(pdf, { title: 'כותרת עברית' }, undefined, 'ltr'), { updateMetadata: false })
  expect(ltr.getTitle()).toBe('\u200eכותרת עברית')
})

test('omits empty authors from Info and XMP', async () => {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  writeDocumentMetadata(document, { title: 'Seder', authors: [] })
  const loaded = await PDFDocument.load(await document.save(), { updateMetadata: false })

  expect(loaded.getAuthor()).toBeUndefined()
  expect(xmp(loaded)).not.toContain('<dc:creator>')
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

test('removes producer, creator, and render-time dates when no output date is known', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  document.setProducer('Skia/PDF')
  document.setCreator('HeadlessChrome')
  document.setCreationDate(new Date('2026-11-11T12:00:00Z'))
  document.setModificationDate(new Date('2026-11-11T12:00:00Z'))

  const loaded = await PDFDocument.load(await withDocumentMetadata(await document.save()), { updateMetadata: false })

  expect(loaded.getProducer()).toBeUndefined()
  expect(loaded.getCreator()).toBeUndefined()
  expect(loaded.getCreationDate()).toBeUndefined()
  expect(loaded.getModificationDate()).toBeUndefined()
  expect(loaded.catalog.get(key('Metadata'))).toBeUndefined()
})

test.each([
  [{ kind: 'instant', moment: Date.parse('2026-07-04T16:34:56.789Z'), zone: 'America/New_York' }, "D:20260704123456-04'00'", '2026-07-04T12:34:56.789-04:00'],
  [{ kind: 'date', date: '2026-11-14' }, 'D:20261114', '2026-11-14'],
] as const)('writes exact Info and XMP dates for %s', async (date, expectedPdf, expectedIso) => {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.addPage()
  const output = await withDocumentMetadata(await document.save(), undefined, date as OutputDate)
  const loaded = await PDFDocument.load(output, { updateMetadata: false })
  const info = loaded.context.lookup(loaded.context.trailerInfo.Info, PDFDict)

  expect(info.lookup(key('CreationDate'), PDFString).decodeText()).toBe(expectedPdf)
  expect(info.lookup(key('ModDate'), PDFString).decodeText()).toBe(expectedPdf)
  expect(xmp(loaded)).toContain(`<xmp:CreateDate>${expectedIso}</xmp:CreateDate>`)
  expect(xmp(loaded)).toContain(`<xmp:ModifyDate>${expectedIso}</xmp:ModifyDate>`)
})
