import { expect, test } from 'bun:test'
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { enforcePdfBytes } from './pdf-finish.ts'
import { createPdfProtector, generatedOwnerPassword, loadQpdf, runQpdf, type WritableQpdf } from './protect-pdf.ts'

const qpdf = loadQpdf()
const protectPdf = createPdfProtector()

let fileNumber = 0

async function decrypt(pdf: Uint8Array, password: string): Promise<Uint8Array> {
  const instance = await qpdf
  const number = fileNumber++
  const input = `/test-${number}-input.pdf`
  const output = `/test-${number}-output.pdf`
  instance.FS.writeFile(input, pdf)
  try {
    const status = runQpdf(instance, [`--password=${password}`, '--decrypt', '--', input, output])
    if (status !== 0) throw new Error(`qpdf returned ${status}`)
    return new Uint8Array(instance.FS.readFile(output))
  } finally {
    instance.FS.unlink(input)
    try {
      instance.FS.unlink(output)
    } catch {}
  }
}

const key = (name: string) => PDFName.of(name)

async function fixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create({ updateMetadata: false })
  const page = document.addPage([400, 600])
  document.catalog.set(key('StructTreeRoot'), document.context.obj({ Type: 'StructTreeRoot', K: [] }))
  document.catalog.set(key('MarkInfo'), document.context.obj({ Marked: PDFBool.True }))
  document.catalog.set(key('Outlines'), document.context.obj({ Type: 'Outlines', Count: 0 }))
  document.catalog.set(key('Lang'), PDFString.of('he'))
  const annotations = ['https://example.com/one', 'https://example.com/two'].map((uri, index) =>
    document.context.register(
      document.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [10, 20 + index * 20, 100, 30 + index * 20],
        Border: [0, 0, 0],
        A: { S: 'URI', URI: PDFString.of(uri) },
      }),
    ),
  )
  page.node.set(key('Annots'), document.context.obj(annotations))
  return document.save()
}

function encryption(pdf: Uint8Array): string {
  const source = new TextDecoder('latin1').decode(pdf)
  const reference = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(source)
  if (!reference) throw new Error('The PDF has no Encrypt reference.')
  const object = new RegExp(`${reference[1]}\\s+${reference[2]}\\s+obj([\\s\\S]*?)endobj`).exec(source)
  if (!object) throw new Error('The PDF has no Encrypt dictionary object.')
  return object[1] as string
}

test('writes AES-256 revision 6 and maps default and full permissions', async () => {
  const input = await fixture()
  const defaults = encryption(await protectPdf(input, { ownerPassword: 'owner-default' }))
  const full = encryption(
    await protectPdf(input, {
      ownerPassword: 'owner-full',
      permissions: { print: 'high', copy: true, modify: true, annotate: true, fillForms: true, assemble: true },
    }),
  )

  expect(defaults).toMatch(/\/V\s+5\b/)
  expect(defaults).toMatch(/\/R\s+6\b/)
  expect(defaults).toMatch(/\/P\s+-1340\b/)
  expect(full).toMatch(/\/P\s+-4\b/)
})

test.each([
  [{ copy: true }, -1324],
  [{ print: 'none' as const }, -3392],
  [{ modify: true, annotate: false }, -1332],
])('maps mixed permissions %j to /P %i', async (permissions, expected) => {
  const dictionary = encryption(await protectPdf(await fixture(), { ownerPassword: 'owner-mixed', permissions }))
  expect(dictionary).toMatch(new RegExp(`/P\\s+${expected}\\b`))
})

test('keeps structure, outlines, links, and language after owner decryption', async () => {
  const output = await protectPdf(await fixture(), { ownerPassword: 'owner-structure' })
  const document = await PDFDocument.load(await decrypt(output, 'owner-structure'), { updateMetadata: false })
  const annotations = document.getPage(0).node.lookup(key('Annots'), PDFArray)

  expect(document.catalog.lookup(key('StructTreeRoot'))).toBeInstanceOf(PDFDict)
  expect(document.catalog.lookup(key('MarkInfo'), PDFDict).lookup(key('Marked'))).toEqual(PDFBool.True)
  expect(document.catalog.lookup(key('Outlines'))).toBeInstanceOf(PDFDict)
  expect(annotations.size()).toBe(2)
  expect(document.catalog.lookup(key('Lang'), PDFString).decodeText()).toBe('he')
})

test('requires the open password while the owner password can still decrypt', async () => {
  const output = await protectPdf(await fixture(), { ownerPassword: 'owner-open', openPassword: 'reader-open' })
  await expect(decrypt(output, '')).rejects.toThrow('qpdf returned')
  expect((await decrypt(output, 'reader-open')).byteLength).toBeGreaterThan(0)
  expect((await decrypt(output, 'owner-open')).byteLength).toBeGreaterThan(0)
})

test('does not expose a generated owner password and only that password decrypts', async () => {
  const password = 'Agenerated-owner-password'
  const generatedProtector = createPdfProtector({ ownerPassword: () => password })
  const output = await generatedProtector(await fixture(), {})
  expect(new TextDecoder('latin1').decode(output)).not.toContain(password)
  expect((await decrypt(output, password)).byteLength).toBeGreaterThan(0)
  await expect(decrypt(output, 'different-password')).rejects.toThrow('qpdf returned')
  expect(() => enforcePdfBytes(output, { bytes: 1 })).toThrow()
  try {
    enforcePdfBytes(output, { bytes: 1 })
  } catch (error) {
    expect(String(error)).not.toContain(password)
  }
})

test('generated owner passwords never begin with a qpdf option prefix', () => {
  for (let draw = 0; draw < 1_000; draw += 1) expect(generatedOwnerPassword()).not.toStartWith('-')
})

test('restores the host process exit code after qpdf runs', async () => {
  const previous = process.exitCode
  process.exitCode = 7
  try {
    await protectPdf(await fixture(), { ownerPassword: 'owner-exit-code' })
    expect(process.exitCode).toBe(7)
  } finally {
    process.exitCode = previous
  }
})

test('retries loading qpdf after a load failure', async () => {
  let attempts = 0
  const retrying = createPdfProtector({
    loadQpdf: async (): Promise<WritableQpdf> => {
      attempts += 1
      if (attempts === 1) throw new Error('load failed')
      return qpdf
    },
  })
  await expect(retrying(await fixture(), { ownerPassword: 'owner-retry' })).rejects.toThrow('qpdf could not be loaded; the next render retries')
  expect((await retrying(await fixture(), { ownerPassword: 'owner-retry' })).byteLength).toBeGreaterThan(0)
  expect(attempts).toBe(2)
})

test('treats qpdf status 3 as success with warnings', async () => {
  const warningInstance = {
    callMain: () => 3,
    FS: {
      writeFile: () => {},
      readFile: () => new Uint8Array([3]),
      unlink: () => {},
    },
  } as unknown as WritableQpdf
  const warningProtector = createPdfProtector({ loadQpdf: async () => warningInstance })
  expect(await warningProtector(new Uint8Array([1]), { ownerPassword: 'owner-warning' })).toEqual(new Uint8Array([3]))
})
