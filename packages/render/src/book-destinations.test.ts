import { expect, test } from 'bun:test'
import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { joinedDestinations, namedDestinations } from './book-destinations.ts'
import { RenderRefusedError } from './errors.ts'

const key = (value: string) => PDFName.of(value)

test('joins front and body destinations into output page numbers', () => {
  const frontDestination = { page: 2, x: 10, y: 20 }
  const bodyDestination = { page: 3, x: 30, y: 40 }
  const joined = joinedDestinations({ pages: 4, destinations: new Map([['front', frontDestination]]) }, { destinations: new Map([['body', bodyDestination]]) })

  expect(joined).toEqual(
    new Map([
      ['front', frontDestination],
      ['body', { ...bodyDestination, page: 7 }],
    ]),
  )
})

test('refuses a self-referencing destination name tree', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  const tree = document.context.obj({})
  const reference = document.context.register(tree)
  tree.set(key('Kids'), document.context.obj([reference]))
  document.catalog.set(key('Names'), document.context.obj({ Dests: reference }))
  expect(() => namedDestinations(document)).toThrow(RenderRefusedError)
  expect(() => namedDestinations(document)).toThrow('cycle')
})

test('refuses a destination name tree beyond 10000 entries', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage()
  const names = []
  for (let index = 0; index <= 10_000; index += 1) {
    names.push(PDFHexString.fromText(String(index)), document.context.obj([page.ref, 'XYZ', 0, 0, null]))
  }
  document.catalog.set(key('Names'), document.context.obj({ Dests: { Names: names } }))
  expect(() => namedDestinations(document)).toThrow(RenderRefusedError)
  expect(() => namedDestinations(document)).toThrow('10000')
})
