import { expect, test } from 'bun:test'
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib'
import { namedDestinations } from './book-destinations.ts'
import { RenderLimitError } from './errors.ts'
import { mergePdfParts, PdfPartsRefusedError } from './pdf-merge.ts'

const key = (value: string) => PDFName.of(value)
const deadline = { signal: new AbortController().signal, remaining: () => 60_000 }

async function part(options: { title?: string; tagged?: boolean; namedLink?: boolean } = {}): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([300, 400])
  if (options.title !== undefined) document.setTitle(options.title)
  if (options.namedLink) {
    const destination = document.context.obj([page.ref, 'XYZ', 12, 345, null])
    document.catalog.set(key('Names'), document.context.obj({ Dests: { Names: [PDFHexString.fromText('chapter-1'), destination] } }))
    const annotation = document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], Dest: PDFString.of('chapter-1') })
    page.node.set(key('Annots'), document.context.obj([document.context.register(annotation)]))
  }
  if (options.tagged) {
    page.node.set(key('StructParents'), PDFNumber.of(0))
    const root = document.context.obj({ Type: 'StructTreeRoot', ParentTree: { Nums: [] }, ParentTreeNextKey: 0 })
    const rootReference = document.context.register(root)
    const leaf = document.context.obj({ Type: 'StructElem', S: 'P', P: rootReference, Pg: page.ref, K: [] })
    root.set(key('K'), document.context.register(leaf))
    document.catalog.set(key('StructTreeRoot'), rootReference)
    document.catalog.set(key('MarkInfo'), document.context.obj({ Marked: PDFBool.True }))
  }
  return document.save()
}

test('merges tagged parts under one tagged Document', async () => {
  const merged = await mergePdfParts(
    [
      { pdf: await part({ title: 'One', tagged: true }) },
      { pdf: await part({ title: 'Two', tagged: true }) },
    ],
    { metadata: { title: 'Combined', lang: 'en' } },
    deadline,
  )
  const document = await PDFDocument.load(merged.pdf)
  const root = document.context.lookup(document.catalog.get(key('StructTreeRoot')), PDFDict)
  const element = document.context.lookup(root.get(key('K')), PDFDict)
  expect(merged.tagged).toBe(true)
  expect(element.lookup(key('S'), PDFName)).toEqual(key('Document'))
})

test('untags a tagged and untagged mix and reports the untagged source index', async () => {
  const merged = await mergePdfParts(
    [
      { pdf: await part({ title: 'One', tagged: true }) },
      { pdf: await part({ title: 'Two' }) },
    ],
    { metadata: { title: 'Combined' } },
    deadline,
  )
  const document = await PDFDocument.load(merged.pdf)
  expect(merged.tagged).toBe(false)
  expect(merged.untagged).toEqual([1])
  expect(document.catalog.get(key('StructTreeRoot'))).toBeUndefined()
  expect(document.getPages().every((page) => page.node.get(key('StructParents')) === undefined)).toBe(true)
})

test('qualifies reused names and rewrites each link to its own part', async () => {
  const merged = await mergePdfParts(
    [
      { pdf: await part({ title: 'One', namedLink: true }) },
      { pdf: await part({ title: 'Two', namedLink: true }) },
    ],
    { metadata: { title: 'Combined' } },
    deadline,
  )
  const document = await PDFDocument.load(merged.pdf)
  expect([...namedDestinations(document).keys()]).toEqual(['1/chapter-1', '2/chapter-1'])
  const destinations = document.getPages().map((page) => {
    const annotations = page.node.lookup(key('Annots'), PDFArray)
    const annotation = document.context.lookup(annotations.get(0), PDFDict)
    return annotation.lookup(key('Dest'), PDFArray).get(0).toString()
  })
  expect(destinations).toEqual(document.getPages().map((page) => page.ref.toString()))
})

test('collects unreadable parts, skips them only when requested, and still refuses all-refused', async () => {
  const invalid = new TextEncoder().encode('not a pdf')
  await expect(
    mergePdfParts([{ pdf: invalid }, { pdf: await part({ title: 'Kept' }) }], { metadata: { title: 'Combined' } }, deadline),
  ).rejects.toBeInstanceOf(PdfPartsRefusedError)
  const partial = await mergePdfParts(
    [{ pdf: invalid }, { pdf: await part({ title: 'Kept' }) }],
    { metadata: { title: 'Combined' }, skipRefused: true },
    deadline,
  )
  expect(partial.refused.map(({ index }) => index)).toEqual([0])
  await expect(mergePdfParts([{ pdf: invalid }], { metadata: { title: 'Combined' }, skipRefused: true }, deadline)).rejects.toBeInstanceOf(
    PdfPartsRefusedError,
  )
})

test('a whole-merge sheet limit refuses even with skipRefused', async () => {
  await expect(
    mergePdfParts(
      [
        { pdf: await part({ title: 'One' }) },
        { pdf: await part({ title: 'Two' }) },
      ],
      { metadata: { title: 'Combined' }, limits: { sheets: 1 }, skipRefused: true },
      deadline,
    ),
  ).rejects.toBeInstanceOf(RenderLimitError)
})
