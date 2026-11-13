import { PDFArray, PDFBool, PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, type PDFPage, PDFRef, PDFStream } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'

const key = (value: string) => PDFName.of(value)

export interface PdfPart {
  document: PDFDocument
  name: string
}

interface CopiedPart extends PdfPart {
  pages: PDFPage[]
}

class StructureCopier {
  private readonly copied = new Map<PDFObject, PDFObject>()

  constructor(
    private readonly source: PDFDocument,
    private readonly target: PDFDocument,
    replacements: ReadonlyMap<PDFObject, PDFObject>,
  ) {
    for (const [source, target] of replacements) this.copied.set(source, target)
  }

  copy = (source: PDFObject): PDFObject => {
    const existing = this.copied.get(source)
    if (existing) return existing
    if (source instanceof PDFRef) {
      const reference = this.target.context.nextRef()
      this.copied.set(source, reference)
      const value = this.source.context.lookup(source)
      if (value) this.target.context.assign(reference, this.copy(value))
      return reference
    }
    if (source instanceof PDFDict) {
      const dictionary = source.clone(this.target.context)
      this.copied.set(source, dictionary)
      for (const [name, value] of source.entries()) dictionary.set(name, this.copy(value))
      return dictionary
    }
    if (source instanceof PDFArray) {
      const array = source.clone(this.target.context)
      this.copied.set(source, array)
      for (let index = 0; index < source.size(); index += 1) array.set(index, this.copy(source.get(index)))
      return array
    }
    if (source instanceof PDFStream) {
      const stream = source.clone(this.target.context)
      this.copied.set(source, stream)
      for (const [name, value] of source.dict.entries()) stream.dict.set(name, this.copy(value))
      return stream
    }
    return source.clone()
  }
}

function structureRoot(document: PDFDocument): { object: PDFObject; dictionary: PDFDict } | undefined {
  const object = document.catalog.get(key('StructTreeRoot'))
  if (!object) return undefined
  return { object, dictionary: document.context.lookup(object, PDFDict) }
}

function arrayItems(array: PDFArray): PDFObject[] {
  return Array.from({ length: array.size() }, (_, index) => array.get(index))
}

function rootChildren(root: PDFDict, document: PDFDocument): PDFObject[] {
  const children = root.get(key('K'))
  if (!children) return []
  const resolved = document.context.lookup(children)
  return resolved instanceof PDFArray ? arrayItems(resolved) : [children]
}

function numberTreeEntries(document: PDFDocument, nodeObject: PDFObject | undefined): Array<[number, PDFObject]> {
  if (!nodeObject) return []
  const node = document.context.lookup(nodeObject, PDFDict)
  const numbers = node.lookupMaybe(key('Nums'), PDFArray)
  const own: Array<[number, PDFObject]> = []
  if (numbers) {
    for (let index = 0; index + 1 < numbers.size(); index += 2) {
      own.push([(numbers.lookup(index, PDFNumber) as PDFNumber).asNumber(), numbers.get(index + 1)])
    }
  }
  const kids = node.lookupMaybe(key('Kids'), PDFArray)
  return kids ? [...own, ...arrayItems(kids).flatMap((kid) => numberTreeEntries(document, kid))] : own
}

function annotationRefs(page: PDFPage): PDFObject[] {
  const annotations = page.node.lookupMaybe(key('Annots'), PDFArray)
  return annotations ? arrayItems(annotations) : []
}

function pageReplacements(part: CopiedPart): Map<PDFObject, PDFObject> {
  const replacements = new Map<PDFObject, PDFObject>()
  for (const [index, sourcePage] of part.document.getPages().entries()) {
    const targetPage = part.pages[index]
    if (!targetPage) continue
    replacements.set(sourcePage.ref, targetPage.ref)
    const sourceAnnotations = annotationRefs(sourcePage)
    const targetAnnotations = annotationRefs(targetPage)
    sourceAnnotations.forEach((annotation, annotationIndex) => {
      const target = targetAnnotations[annotationIndex]
      if (target) replacements.set(annotation, target)
    })
  }
  return replacements
}

function mergeMap(target: PDFDict, source: PDFDict | undefined, copier: StructureCopier): void {
  if (!source) return
  for (const [name, value] of source.entries()) target.set(name, copier.copy(value))
}

function parentKeys(part: CopiedPart): Array<{ target: PDFDict; name: PDFName; oldKey: number }> {
  return part.document.getPages().flatMap((sourcePage, pageIndex) => {
    const keys: Array<{ target: PDFDict; name: PDFName; oldKey: number }> = []
    const targetPage = part.pages[pageIndex] as PDFPage
    const pageKey = sourcePage.node.lookupMaybe(key('StructParents'), PDFNumber)
    if (pageKey) keys.push({ target: targetPage.node, name: key('StructParents'), oldKey: pageKey.asNumber() })
    for (const [annotationIndex, annotationObject] of annotationRefs(sourcePage).entries()) {
      const annotation = part.document.context.lookup(annotationObject, PDFDict)
      const annotationKey = annotation.lookupMaybe(key('StructParent'), PDFNumber)
      const targetObject = annotationRefs(targetPage)[annotationIndex]
      if (annotationKey && targetObject) {
        keys.push({ target: targetPage.doc.context.lookup(targetObject, PDFDict), name: key('StructParent'), oldKey: annotationKey.asNumber() })
      }
    }
    return keys
  })
}

function mergeTaggedStructure(target: PDFDocument, parts: CopiedPart[], roots: Array<{ object: PDFObject; dictionary: PDFDict }>): void {
  const root = target.context.obj({ Type: 'StructTreeRoot' })
  const rootReference = target.context.register(root)
  const documentElement = target.context.obj({ Type: 'StructElem', S: 'Document', P: rootReference, K: [] })
  const documentReference = target.context.register(documentElement)
  const children = documentElement.lookup(key('K'), PDFArray)
  const parentNumbers: PDFObject[] = []
  const roleMap = target.context.obj({})
  const classMap = target.context.obj({})
  let nextParentKey = 0

  parts.forEach((part, partIndex) => {
    const sourceRoot = roots[partIndex] as { object: PDFObject; dictionary: PDFDict }
    const replacements = pageReplacements(part)
    replacements.set(sourceRoot.object, documentReference)
    replacements.set(sourceRoot.dictionary, documentReference)
    const copier = new StructureCopier(part.document, target, replacements)
    for (const child of rootChildren(sourceRoot.dictionary, part.document)) children.push(copier.copy(child))

    const parentTree = new Map(numberTreeEntries(part.document, sourceRoot.dictionary.get(key('ParentTree'))))
    for (const parent of parentKeys(part)) {
      const value = parentTree.get(parent.oldKey)
      if (!value) continue
      parent.target.set(parent.name, PDFNumber.of(nextParentKey))
      parentNumbers.push(PDFNumber.of(nextParentKey), copier.copy(value))
      nextParentKey += 1
    }
    mergeMap(roleMap, sourceRoot.dictionary.lookupMaybe(key('RoleMap'), PDFDict), copier)
    mergeMap(classMap, sourceRoot.dictionary.lookupMaybe(key('ClassMap'), PDFDict), copier)
  })

  root.set(key('K'), documentReference)
  root.set(key('ParentTree'), target.context.obj({ Nums: parentNumbers }))
  root.set(key('ParentTreeNextKey'), PDFNumber.of(nextParentKey))
  if (roleMap.keys().length > 0) root.set(key('RoleMap'), roleMap)
  if (classMap.keys().length > 0) root.set(key('ClassMap'), classMap)
  target.catalog.set(key('StructTreeRoot'), rootReference)
  target.catalog.set(key('MarkInfo'), target.context.obj({ Marked: PDFBool.True }))
}

export async function copyPdfParts(target: PDFDocument, parts: PdfPart[]): Promise<void> {
  const roots = parts.map((part) => structureRoot(part.document))
  const tagged = roots.map(Boolean)
  if (tagged.some(Boolean) && !tagged.every(Boolean)) {
    const untagged = parts[tagged.findIndex((value) => !value)] as PdfPart
    throw new RenderRefusedError(`Cannot join tagged and untagged PDFs; ${untagged.name} is untagged.`)
  }
  const copied: CopiedPart[] = []
  for (const part of parts) {
    const pages = await target.copyPages(part.document, part.document.getPageIndices())
    for (const page of pages) target.addPage(page)
    copied.push({ ...part, pages })
  }
  if (roots.length > 0 && roots.every((root) => root !== undefined)) {
    mergeTaggedStructure(target, copied, roots as Array<{ object: PDFObject; dictionary: PDFDict }>)
  }
}
