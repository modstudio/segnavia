import { expect, test } from 'bun:test'
import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject } from 'pdf-lib'
import { joinPdfs } from './pdf-join.ts'

const key = (value: string) => PDFName.of(value)
const resolved = (document: PDFDocument, object: PDFObject | undefined) => (object ? document.context.lookup(object) : undefined)

async function taggedPart(label: string, mapSuffix: string): Promise<Uint8Array> {
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
  root.set(key('K'), leafReference)
  root.set(key('ParentTree'), document.context.obj({ Nums: [0, [leafReference], 1, leafReference] }))
  root.set(key('ParentTreeNextKey'), PDFNumber.of(2))
  root.set(key('RoleMap'), document.context.obj({ [`Role${mapSuffix}`]: 'H1' }))
  root.set(key('ClassMap'), document.context.obj({ [`class${mapSuffix}`]: { O: 'Layout' } }))
  document.catalog.set(key('StructTreeRoot'), rootReference)
  document.catalog.set(key('MarkInfo'), document.context.obj({ Marked: PDFBool.True }))
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

test('merges tagged leaves and renumbers page and annotation parents (mutation: skip StructParents renumbering)', async () => {
  const output = await PDFDocument.load(await joinPdfs([await taggedPart('First leaf', 'One'), await taggedPart('Second leaf', 'Two')]))
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
    'Cannot join tagged and untagged PDFs; PDF part at index 1 is untagged.',
  )
})

test('leaves an all-untagged join untagged', async () => {
  const output = await PDFDocument.load(await joinPdfs([await untaggedPart(), await untaggedPart()]))
  expect(output.catalog.get(key('StructTreeRoot'))).toBeUndefined()
})
