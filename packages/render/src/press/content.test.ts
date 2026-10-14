import { expect, test } from 'bun:test'
import { rewriteContent } from './content.ts'

const bytes = (value: string) => new TextEncoder().encode(value)
const text = (value: Uint8Array) => new TextDecoder().decode(value)
const convert = ([red, green, blue]: [number, number, number]): [number, number, number, number] => [red / 2, green / 2, blue / 2, 0.25]

test('rewrites RGB and gray fills and strokes in every PDF numeric form', () => {
  const source = '.5 -0 1. rg +1 .5 0 RG 0.2 g 1. G'
  const result = rewriteContent(bytes(source), convert)
  expect(text(result.bytes)).toBe('0.25 0 0.5 0.25 k 0.5 0.25 0 0.25 K 0 0 0 0.8 k 0 0 0 0 K')
  expect(result.counts).toEqual({ fills: 2, strokes: 2 })
})

test('skips strings, hex, comments, dictionaries, arrays, and inline image data', () => {
  const source = String.raw`(outer (1 0 0 rg) escaped \( still) Tj <3120302030207267> Tj % 1 0 0 rg
<< /Note (1 0 0 rg) >> BDC [(1 0 0 rg)] TJ EMC BI /W 1 /H 1 /CS /G ID binary 1 0 0 rg EI /Pattern cs /P1 scn`
  const result = rewriteContent(bytes(source), convert)
  expect(text(result.bytes)).toBe(source)
  expect(result.counts).toEqual({ fills: 0, strokes: 0 })
})

test.each([
  ['cs', '/DeviceRGB cs'],
  ['CS', '/CalRGB CS'],
  ['sc', '0.2 sc'],
  ['SC', '0.2 SC'],
  ['scn', '0.2 scn'],
  ['SCN', '0.2 SCN'],
  ['BI', 'BI /CS /RGB ID x EI'],
] as const)('refuses unsupported %s color use and names the operator', (operator, source) => {
  expect(() => rewriteContent(bytes(source), convert)).toThrow(operator)
})

test.each(['(unfinished', '<123', '<< /A 1', '[1 2', 'BI /W 1 ID data'])('refuses a truncated stream: %s', (source) => {
  expect(() => rewriteContent(bytes(source), convert)).toThrow(/truncated/)
})
