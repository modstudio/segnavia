import { expect, test } from 'bun:test'
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from 'pdf-lib'
import { namedDestinations } from './book-destinations.ts'
import { RenderLimitError } from './errors.ts'
import { mergePdfParts, PdfPartsRefusedError } from './pdf-merge.ts'
import { readPdfOutline } from './pdf-outline-read.ts'

const key = (value: string) => PDFName.of(value)
const deadline = { signal: new AbortController().signal, remaining: () => 60_000 }

async function part(
  options: {
    title?: string
    tagged?: boolean
    namedLink?: boolean
    explicitLink?: boolean
    goToLink?: boolean
    missingNamedLink?: boolean
    malformedStructure?: boolean
  } = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([300, 400])
  if (options.title !== undefined) document.setTitle(options.title)
  if (options.namedLink) {
    const destination = document.context.obj([page.ref, 'XYZ', 12, 345, null])
    document.catalog.set(key('Names'), document.context.obj({ Dests: { Names: [PDFHexString.fromText('chapter-1'), destination] } }))
  }
  if (options.namedLink || options.explicitLink || options.goToLink || options.missingNamedLink) {
    const destination = options.explicitLink ? [page.ref, 'XYZ', 12, 345, null] : PDFString.of(options.missingNamedLink ? 'missing' : 'chapter-1')
    const annotation = document.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [0, 0, 10, 10],
      ...(options.goToLink ? { A: { S: 'GoTo', D: destination } } : { Dest: destination }),
    })
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
  if (options.malformedStructure) document.catalog.set(key('StructTreeRoot'), PDFNumber.of(1))
  return document.save()
}

async function encryptedPart(): Promise<Uint8Array> {
  const bytes = await part({ title: 'Encrypted' })
  return new TextEncoder().encode(new TextDecoder('latin1').decode(bytes).replace('%%EOF', '/Encrypt 1 0 R\n%%EOF'))
}

test('merges tagged parts under one tagged Document', async () => {
  const merged = await mergePdfParts(
    [{ pdf: await part({ title: 'One', tagged: true }) }, { pdf: await part({ title: 'Two', tagged: true }) }],
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
    [{ pdf: await part({ title: 'One', tagged: true }) }, { pdf: await part({ title: 'Two' }) }],
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
    [{ pdf: await part({ title: 'One', namedLink: true }) }, { pdf: await part({ title: 'Two', namedLink: true }) }],
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

test('rewrites an explicit link to the copied page without retaining a stray page object', async () => {
  const merged = await mergePdfParts([{ pdf: await part({ title: 'Explicit', explicitLink: true }) }], { metadata: { title: 'Combined' } }, deadline)
  const document = await PDFDocument.load(merged.pdf)
  const page = document.getPage(0)
  const annotations = page.node.lookup(key('Annots'), PDFArray)
  const annotation = document.context.lookup(annotations.get(0), PDFDict)
  expect(annotation.lookup(key('Dest'), PDFArray).get(0).toString()).toBe(page.ref.toString())
  const pageObjects = document.context
    .enumerateIndirectObjects()
    .filter(([, object]) => object instanceof PDFDict && object.lookupMaybe(key('Type'), PDFName) === key('Page'))
  expect(pageObjects.map(([reference]) => reference.toString())).toEqual(document.getPages().map(({ ref }) => ref.toString()))
})

test('rewrites a GoTo action destination to the copied page', async () => {
  const merged = await mergePdfParts([{ pdf: await part({ title: 'Action', namedLink: true, goToLink: true }) }], { metadata: { title: 'Combined' } }, deadline)
  const document = await PDFDocument.load(merged.pdf)
  const page = document.getPage(0)
  const annotations = page.node.lookup(key('Annots'), PDFArray)
  const annotation = document.context.lookup(annotations.get(0), PDFDict)
  expect(annotation.lookup(key('Dest'), PDFArray).get(0).toString()).toBe(page.ref.toString())
  expect(annotation.get(key('A'))).toBeUndefined()
})

test('collects a missing named link as a part refusal and skips it when requested', async () => {
  const missing = await part({ title: 'Missing', missingNamedLink: true })
  await expect(mergePdfParts([{ pdf: missing }, { pdf: await part({ title: 'Kept' }) }], { metadata: { title: 'Combined' } }, deadline)).rejects.toBeInstanceOf(
    PdfPartsRefusedError,
  )
  const partial = await mergePdfParts(
    [{ pdf: missing }, { pdf: await part({ title: 'Kept' }) }],
    { metadata: { title: 'Combined' }, skipRefused: true },
    deadline,
  )
  expect(partial.refused.map(({ index }) => index)).toEqual([0])
})

test('targets each part outline entry at the top of its first page', async () => {
  const merged = await mergePdfParts([{ pdf: await part({ title: 'First' }) }], { metadata: { title: 'Combined' } }, deadline)
  expect(readPdfOutline(await PDFDocument.load(merged.pdf))[0]?.destination).toEqual({ page: 1, x: 0, y: 400 })
})

test('collects unreadable parts, skips them only when requested, and still refuses all-refused', async () => {
  const invalid = new TextEncoder().encode('not a pdf')
  await expect(mergePdfParts([{ pdf: invalid }, { pdf: await part({ title: 'Kept' }) }], { metadata: { title: 'Combined' } }, deadline)).rejects.toBeInstanceOf(
    PdfPartsRefusedError,
  )
  const partial = await mergePdfParts(
    [{ pdf: invalid }, { pdf: await part({ title: 'Kept' }) }],
    { metadata: { title: 'Combined' }, skipRefused: true },
    deadline,
  )
  expect(partial.refused.map(({ index }) => index)).toEqual([0])
  await expect(mergePdfParts([{ pdf: invalid }], { metadata: { title: 'Combined' }, skipRefused: true }, deadline)).rejects.toBeInstanceOf(PdfPartsRefusedError)
})

test('refuses a valid part with neither a label nor a document title', async () => {
  await expect(mergePdfParts([{ pdf: await part() }], { metadata: { title: 'Combined' } }, deadline)).rejects.toMatchObject({
    code: 'pdf-parts',
    entries: [{ index: 0 }],
  })
})

test('collects a malformed declared structure root as a part refusal', async () => {
  const partial = await mergePdfParts(
    [{ pdf: await part({ title: 'Malformed', malformedStructure: true }) }, { pdf: await part({ title: 'Kept' }) }],
    { metadata: { title: 'Combined' }, skipRefused: true },
    deadline,
  )
  expect(partial.refused).toMatchObject([{ index: 0, error: { code: 'render' } }])
})

test('collects an encrypted part and merges around it only with skipRefused', async () => {
  const encrypted = await encryptedPart()
  await expect(
    mergePdfParts([{ pdf: encrypted }, { pdf: await part({ title: 'Kept' }) }], { metadata: { title: 'Combined' } }, deadline),
  ).rejects.toBeInstanceOf(PdfPartsRefusedError)
  const partial = await mergePdfParts(
    [{ pdf: encrypted }, { pdf: await part({ title: 'Kept' }) }],
    { metadata: { title: 'Combined' }, skipRefused: true },
    deadline,
  )
  expect(partial.refused[0]?.error.message).toContain('encrypted')
})

test('a whole-merge sheet limit refuses even with skipRefused', async () => {
  await expect(
    mergePdfParts(
      [{ pdf: await part({ title: 'One' }) }, { pdf: await part({ title: 'Two' }) }],
      { metadata: { title: 'Combined' }, limits: { sheets: 1 }, skipRefused: true },
      deadline,
    ),
  ).rejects.toBeInstanceOf(RenderLimitError)
})
