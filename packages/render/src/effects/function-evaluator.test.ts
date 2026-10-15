import { expect, test } from 'bun:test'
import { PDFDocument, PDFName, type PDFObject } from 'pdf-lib'
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

test('builds each dictionary in a repeated stitching DAG once', async () => {
  const document = await PDFDocument.create()
  let child = document.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 1 })
  const dictionaries = [child]
  for (let depth = 0; depth < 4; depth++) {
    const reference = document.context.register(child)
    child = document.context.obj({
      FunctionType: 3,
      Domain: [0, 1],
      Functions: Array.from({ length: 16 }, () => reference),
      Bounds: Array.from({ length: 15 }, (_, index) => (index + 1) / 16),
      Encode: Array.from({ length: 16 }, () => [0, 1]).flat(),
    })
    dictionaries.push(child)
  }
  let builds = 0
  for (const dictionary of dictionaries) {
    const lookupMaybe = dictionary.lookupMaybe.bind(dictionary) as unknown as (name: PDFName, ...types: unknown[]) => PDFObject | undefined
    dictionary.lookupMaybe = ((name: PDFName, ...types: unknown[]) => {
      if (name.toString() === '/FunctionType') builds++
      return lookupMaybe(name, ...types)
    }) as unknown as typeof dictionary.lookupMaybe
  }

  expect(functionEvaluator(document, child, 1)).toBeDefined()
  expect(builds).toBe(dictionaries.length)
})
