import { expect, test } from 'bun:test'
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject } from 'pdf-lib'
import { joinPdfs } from './pdf-join.ts'
import { copyPdfParts } from './pdf-structure-merge.ts'

const key = (value: string) => PDFName.of(value)
const resolved = (document: PDFDocument, object: PDFObject | undefined) => (object ? document.context.lookup(object) : undefined)

async function taggedPart(
  label: string,
  mapSuffix: string,
  options: { documentElement?: boolean; lang?: string; missingPageParent?: boolean; parentTreeKids?: boolean } = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const page = document.addPage([300, 400])
  page.node.set(key('StructParents'), PDFNumber.of(0))
  const annotation = document.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 10, 10], StructParent: 1 })
  const annotationReference = document.context.register(annotation)
  page.node.set(key('Annots'), document.context.obj([annotationReference]))

  const root = document.context.obj({ Type: 'StructTreeRoot' })
  const rootReference = document.context.register(root)
  const objectReference = document.context.register(document.context.obj({ Type: 'OBJR', Pg: page.ref, Obj: annotationReference }))
  const leaf = document.context.obj({
    Type: 'StructElem',
    S: 'H1',
    P: rootReference,
    Pg: page.ref,
    K: [0, objectReference],
    Alt: PDFHexString.fromText(label),
    C: `class${mapSuffix}`,
  })
  const leafReference = document.context.register(leaf)
  if (options.documentElement) {
    const documentElement = document.context.obj({ Type: 'StructElem', S: 'Document', P: rootReference, K: [leafReference] })
    const documentReference = document.context.register(documentElement)
    leaf.set(key('P'), documentReference)
    root.set(key('K'), documentReference)
  } else {
    root.set(key('K'), leafReference)
  }
  const parentNumbers = [...(options.missingPageParent ? [] : [0, [leafReference]]), 1, leafReference]
  root.set(
    key('ParentTree'),
    options.parentTreeKids ? document.context.obj({ Kids: [document.context.obj({ Nums: parentNumbers })] }) : document.context.obj({ Nums: parentNumbers }),
  )
  root.set(key('ParentTreeNextKey'), PDFNumber.of(2))
  root.set(key('RoleMap'), document.context.obj({ [`Role${mapSuffix}`]: 'H1' }))
  root.set(key('ClassMap'), document.context.obj({ [`class${mapSuffix}`]: { O: 'Layout' } }))
  document.catalog.set(key('StructTreeRoot'), rootReference)
  document.catalog.set(key('MarkInfo'), document.context.obj({ Marked: PDFBool.True }))
  if (options.lang) document.catalog.set(key('Lang'), PDFHexString.fromText(options.lang))
  return document.save()
}

async function untaggedPart(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.addPage([300, 400])
  return document.save()
}

function parentTree(document: PDFDocument, root: PDFDict): Map<number, PDFObject> {
  const tree = resolved(document, root.get(key('ParentTree'))) as PDFDict
  const numbers = resolved(document, tree.get(key('Nums'))) as PDFArray
  const entries = new Map<number, PDFObject>()
  for (let index = 0; index < numbers.size(); index += 2) entries.set((resolved(document, numbers.get(index)) as PDFNumber).asNumber(), numbers.get(index + 1))
  return entries
}

test('merges tagged leaves and renumbers page and annotation parents (mutation: skip StructParents renumbering or ParentTree Kids)', async () => {
  const output = await PDFDocument.load(
    await joinPdfs([await taggedPart('First leaf', 'One'), await taggedPart('Second leaf', 'Two', { parentTreeKids: true })]),
  )
  const root = resolved(output, output.catalog.get(key('StructTreeRoot'))) as PDFDict
  const documentElement = resolved(output, root.get(key('K'))) as PDFDict
  const children = resolved(output, documentElement.get(key('K'))) as PDFArray
  const leaves = Array.from({ length: children.size() }, (_, index) => resolved(output, children.get(index)) as PDFDict)

  expect(documentElement.lookup(key('S'), PDFName)).toEqual(key('Document'))
  expect(leaves.map((leaf) => leaf.lookup(key('Alt'), PDFHexString).decodeText())).toEqual(['First leaf', 'Second leaf'])
  expect(output.getPages().map((page) => page.node.lookup(key('StructParents'), PDFNumber).asNumber())).toEqual([0, 2])
  expect(
    output.getPages().map((page) => {
      const annotations = page.node.lookup(key('Annots'), PDFArray)
      return output.context.lookup(annotations.get(0), PDFDict).lookup(key('StructParent'), PDFNumber).asNumber()
    }),
  ).toEqual([1, 3])
  const parents = parentTree(output, root)
  expect([...parents.keys()]).toEqual([0, 1, 2, 3])
  expect(output.context.lookup((resolved(output, parents.get(0)) as PDFArray).get(0), PDFDict)).toBe(leaves[0] as PDFDict)
  expect(output.context.lookup((resolved(output, parents.get(2)) as PDFArray).get(0), PDFDict)).toBe(leaves[1] as PDFDict)
  expect((resolved(output, root.get(key('RoleMap'))) as PDFDict).keys().map(String)).toEqual(['/RoleOne', '/RoleTwo'])
  expect((resolved(output, root.get(key('ClassMap'))) as PDFDict).keys().map(String)).toEqual(['/classOne', '/classTwo'])
  const markInfo = resolved(output, output.catalog.get(key('MarkInfo'))) as PDFDict
  expect(markInfo.lookup(key('Marked'), PDFBool)).toBe(PDFBool.True)
})

test('refuses a mix of tagged and untagged parts and names the untagged part', async () => {
  expect(joinPdfs([await taggedPart('Tagged', 'Tagged'), await untaggedPart()])).rejects.toThrow(
    'Cannot join tagged and untagged PDFs; PDF part at index 1 is untagged. Print every part tagged, or every part untagged.',
  )
})

test('hoists a part Document element beneath the merged Document (mutation: retain the part Document)', async () => {
  const output = await PDFDocument.load(await joinPdfs([await taggedPart('Hoisted leaf', 'Hoisted', { documentElement: true })]))
  const root = resolved(output, output.catalog.get(key('StructTreeRoot'))) as PDFDict
  const documentElement = resolved(output, root.get(key('K'))) as PDFDict
  const children = resolved(output, documentElement.get(key('K'))) as PDFArray
  const leaf = resolved(output, children.get(0)) as PDFDict

  expect(children.size()).toBe(1)
  expect(leaf.lookup(key('S'), PDFName)).toEqual(key('H1'))
  expect(leaf.lookup(key('Alt'), PDFHexString).decodeText()).toBe('Hoisted leaf')
})

test('deletes a copied page StructParents key without a ParentTree entry (mutation: retain the stale key)', async () => {
  const output = await PDFDocument.load(await joinPdfs([await taggedPart('Missing page parent', 'Missing', { missingPageParent: true })]))
  const [page] = output.getPages()
  const root = resolved(output, output.catalog.get(key('StructTreeRoot'))) as PDFDict

  expect(page?.node.get(key('StructParents'))).toBeUndefined()
  expect([...parentTree(output, root).keys()]).toEqual([0])
})

test('leaves an all-untagged join untagged', async () => {
  const output = await PDFDocument.load(await joinPdfs([await untaggedPart(), await untaggedPart()]))
  expect(output.catalog.get(key('StructTreeRoot'))).toBeUndefined()
})

test('untag mix policy removes every copied structure key', async () => {
  const tagged = await PDFDocument.load(await taggedPart('Tagged', 'Tagged'))
  const untagged = await PDFDocument.load(await untaggedPart())
  const output = await PDFDocument.create()
  await copyPdfParts(
    output,
    [
      { document: tagged, name: 'tagged' },
      { document: untagged, name: 'untagged' },
    ],
    { mix: 'untag' },
  )
  expect(output.catalog.get(key('StructTreeRoot'))).toBeUndefined()
  expect(output.catalog.get(key('MarkInfo'))).toBeUndefined()
  expect(output.getPages().every((page) => page.node.get(key('StructParents')) === undefined)).toBe(true)
  const annotations = output.getPage(0).node.lookup(key('Annots'), PDFArray)
  expect(output.context.lookup(annotations.get(0), PDFDict).get(key('StructParent'))).toBeUndefined()
})

test('puts a differing part language on its copied top structure element', async () => {
  const source = await PDFDocument.load(await taggedPart('Hebrew', 'Hebrew', { lang: 'he' }))
  const output = await PDFDocument.create()
  await copyPdfParts(output, [{ document: source, name: 'Hebrew' }], { lang: 'en' })
  const root = output.context.lookup(output.catalog.get(key('StructTreeRoot')), PDFDict)
  const documentElement = output.context.lookup(root.get(key('K')), PDFDict)
  const children = documentElement.lookup(key('K'), PDFArray)
  const child = output.context.lookup(children.get(0), PDFDict)
  expect(child.lookup(key('Lang'), PDFHexString).decodeText()).toBe('he')
})

test('does not put a part language on structure elements when no target language is supplied', async () => {
  const source = await PDFDocument.load(await taggedPart('Hebrew', 'Hebrew', { lang: 'he' }))
  const output = await PDFDocument.create()
  await copyPdfParts(output, [{ document: source, name: 'Hebrew' }])
  const root = output.context.lookup(output.catalog.get(key('StructTreeRoot')), PDFDict)
  const documentElement = output.context.lookup(root.get(key('K')), PDFDict)
  const children = documentElement.lookup(key('K'), PDFArray)
  const child = output.context.lookup(children.get(0), PDFDict)
  expect(child.get(key('Lang'))).toBeUndefined()
})
