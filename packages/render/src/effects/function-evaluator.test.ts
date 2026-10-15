import { expect, test } from 'bun:test'
import { PDFDocument, PDFName } from 'pdf-lib'
import { functionEvaluator } from './function-evaluator.ts'

test('stops a cyclic stitching function at its first repeated dictionary', async () => {
  const document = await PDFDocument.create()
  const cyclic = document.context.obj({ FunctionType: 3, Domain: [0, 1], Bounds: [], Encode: [0, 1] })
  const reference = document.context.register(cyclic)
  cyclic.set(PDFName.of('Functions'), document.context.obj([reference]))
  const lookup = document.context.lookup.bind(document.context)
  let lookups = 0
  document.context.lookup = ((...args: Parameters<typeof lookup>) => {
    lookups++
    return lookup(...args)
  }) as typeof document.context.lookup

  expect(functionEvaluator(document, cyclic, 1)).toBeUndefined()
  expect(lookups).toBe(1)
})
