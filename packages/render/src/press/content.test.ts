import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { inspectContent, MAX_OPERANDS, rewriteContent } from './content.ts'

const bytes = (value: string) => new TextEncoder().encode(value)
const text = (value: Uint8Array) => new TextDecoder().decode(value)
const convert = ([red, green, blue]: [number, number, number]): [number, number, number, number] => [red / 2, green / 2, blue / 2, 0.25]

test('rewrites RGB and gray fills and strokes in every PDF numeric form', () => {
  const source = '.5 -0 1. rg +1 .5 0 RG 0.2 g 1. G'
  const result = rewriteContent(bytes(source), convert)
  expect(text(result.bytes)).toBe('0.25 0 0.5 0.25 k 0.5 0.25 0 0.25 K 0.1 0.1 0.1 0.25 k 0.5 0.5 0.5 0.25 K')
  expect(result.counts).toEqual({ fills: 2, strokes: 2 })
})

test('skips strings, hex, comments, dictionaries, arrays, and inline image data', () => {
  const source = String.raw`(outer (1 0 0 rg) escaped \( still) Tj <3120302030207267> Tj % 1 0 0 rg
<< /Note (1 0 0 rg) >> BDC [(1 0 0 rg)] TJ EMC BI /W 15 /H 1 /BPC 8 /CS /G ID binary 1 0 0 rg EI /Pattern cs /P1 scn`
  const result = rewriteContent(bytes(source), convert)
  expect(text(result.bytes)).toBe(source)
  expect(result.counts).toEqual({ fills: 0, strokes: 0 })
})

test('uses declared geometry past EI bytes in raw and Flate inline samples', () => {
  const samples = Buffer.from(' EI ', 'latin1')
  const compressed = deflateSync(samples, { level: 0 })
  expect(compressed.includes(samples)).toBe(true)
  const raw = Buffer.concat([Buffer.from('BI /W 4 /H 1 /BPC 8 /CS /G ID\n'), samples, Buffer.from(' EI 1 0 0 rg')])
  const flate = Buffer.concat([Buffer.from('BI /W 4 /H 1 /BPC 8 /CS /G /F /Fl ID\n'), compressed, Buffer.from(' EI 1 0 0 rg')])
  expect(text(rewriteContent(raw, convert).bytes).endsWith('0.5 0 0 0.25 k')).toBe(true)
  expect(text(rewriteContent(flate, convert).bytes).endsWith('0.5 0 0 0.25 k')).toBe(true)
})

test.each([
  ['cs', '/DeviceRGB cs'],
  ['CS', '/CalRGB CS'],
  ['sc', '0.2 sc'],
  ['SC', '0.2 SC'],
  ['scn', '0.2 scn'],
  ['SCN', '0.2 SCN'],
  ['BI', 'BI /W 1 /H 1 /BPC 8 /CS /RGB ID x EI'],
] as const)('refuses unsupported %s color use and names the operator', (operator, source) => {
  expect(() => rewriteContent(bytes(source), convert)).toThrow(operator)
})

test.each(['(unfinished', '<123', '<< /A 1', '[1 2', 'BI /W 1 /H 1 /BPC 8 /CS /G ID data'])('refuses a truncated stream: %s', (source) => {
  expect(() => rewriteContent(bytes(source), convert)).toThrow(/truncated|data extent/)
})

test.each([
  'BI /W 1 /H 1 /BPC 8 /CS/RGB ID x EI',
  'BI /W 1 /H 1 /BPC 8 /CS /CalRGB ID x EI',
  'BI /W 1 /H 1 /BPC 8 /CS /CS0 ID x EI',
  'BI /W 1 /H 1 /BPC 8 /CS [/Indexed /DeviceRGB 1 <00>] ID x EI',
])('refuses every unsupported inline image space: %s', (source) => expect(() => rewriteContent(bytes(source), convert)).toThrow(/BI operator with color space/))

test.each([
  'BI /W 1 /H 1 /BPC 8 /IM true ID x EI',
  'BI /W 1 /H 1 /BPC 8 /ImageMask true ID x EI',
  'BI /W 1 /H 1 /BPC 8 /CS/G ID x EI',
  'BI /W 1 /H 1 /BPC 8 /CS/DeviceCMYK ID xxxx EI',
])('accepts an inline mask, gray image, or CMYK image: %s', (source) => expect(text(rewriteContent(bytes(source), convert).bytes)).toBe(source))

test('the read-back operator policy refuses gray as well as RGB', () => {
  expect(() => inspectContent(bytes('0.5 g'))).toThrow(/gray color operator g/)
})

test('keeps a Separation All stroke under a CMYK destination', () => {
  const source = '/All CS 1 SCN 10 10 m 20 10 l S'
  expect(text(rewriteContent(bytes(source), convert).bytes)).toBe(source)
  expect(inspectContent(bytes(source)).strokes).toBe(0)
})

test('converts a Separation All stroke to DeviceGray black under a gray destination', () => {
  const result = rewriteContent(bytes('/All CS 1 SCN 10 10 m 20 10 l S'), convert, 'gray')
  expect(text(result.bytes).replace(/\s+/g, ' ').trim()).toBe('0 G 10 10 m 20 10 l S')
  expect(result.counts.strokes).toBe(1)
})

test('refuses any other Separation stroke', () => {
  expect(() => rewriteContent(bytes('/Spot CS 1 SCN'), convert)).toThrow('CS')
})

test('read-back keeps All under CMYK and refuses it under gray', () => {
  expect(() => inspectContent(bytes('/All CS 1 SCN'))).not.toThrow()
  expect(() => inspectContent(bytes('/All CS 1 SCN'), 'gray')).toThrow(/CS operator/)
})

test('refuses an operator whose live operand list passes the ceiling', () => {
  expect(() => rewriteContent(bytes(`${'1 '.repeat(MAX_OPERANDS + 1)}Tj`), convert)).toThrow(`more than ${MAX_OPERANDS} operands`)
})
