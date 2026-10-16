import { createRequire } from 'node:module'
import { visitContentTokens } from '../../packages/render/src/press/content.ts'
import { decodeContent, nameOf } from '../../packages/render/src/press/pdf-objects.ts'
import { walkPressGraph } from '../../packages/render/src/press/visitor.ts'

const renderRequire = createRequire(new URL('../../packages/render/package.json', import.meta.url))
const { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } = renderRequire('pdf-lib')

const forbiddenSpaces = new Set(['/DeviceRGB', '/DeviceCMYK', '/CalRGB'])
const forbiddenOperators = new Set(['rg', 'RG', 'k', 'K'])

export interface ColorResidues {
  errors: string[]
  found: string[]
}

/** Independently scans gray press output instead of relying on the press read-back. */
export async function processColorResidues(bytes: Uint8Array): Promise<ColorResidues> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const errors: string[] = []
  const found = new Set<string>()
  const seen = new WeakSet<object>()
  const scanObject = (object: unknown): void => {
    if (!object || typeof object !== 'object' || seen.has(object as object)) return
    seen.add(object as object)
    if (object instanceof PDFName) {
      const name = object.toString()
      if (forbiddenSpaces.has(name)) found.add(name)
      return
    }
    if (object instanceof PDFArray) {
      const array = object as { get(index: number): unknown; size(): number }
      for (let index = 0; index < array.size(); index++) scanObject(array.get(index))
      return
    }
    if (object instanceof PDFDict) for (const [, value] of (object as { entries(): Iterable<[unknown, unknown]> }).entries()) scanObject(value)
  }
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      if (nameOf(object.dict.get(PDFName.of('Subtype'))) === 'Image') continue
      scanObject(object.dict)
      continue
    }
    scanObject(object)
  }
  walkPressGraph(document, {
    content: (object, stream) => {
      try {
        visitContentTokens(decodeContent(stream), (operator, operands) => {
          if (forbiddenOperators.has(operator)) found.add(operator)
          for (const operand of operands) if (operand.kind === 'name' && forbiddenSpaces.has(operand.raw)) found.add(operand.raw)
        })
      } catch (error) {
        errors.push(`${object.toString()}: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    shading: () => false,
  })
  return { errors, found: [...found] }
}
