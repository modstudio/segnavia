import { expect, test } from 'bun:test'
import { colorSpaceKind, contentFilter } from './policy.ts'

test('classifies direct, ICCBased, and Indexed color spaces in one policy', () => {
  expect(colorSpaceKind({ name: 'DeviceRGB' })).toBe('rgb')
  expect(colorSpaceKind({ name: 'CalRGB' })).toBe('rgb')
  expect(colorSpaceKind({ family: 'ICCBased', channels: 3 })).toBe('rgb')
  expect(colorSpaceKind({ family: 'Indexed', base: { family: 'ICCBased', channels: 3 } })).toBe('rgb')
  expect(colorSpaceKind({ name: 'DeviceGray' })).toBe('gray')
  expect(colorSpaceKind({ name: 'DeviceCMYK' })).toBe('cmyk')
  expect(colorSpaceKind({ name: 'Pattern' })).toBe('other')
})

test('accepts only no filter or one compression filter for content', () => {
  expect(contentFilter(undefined)).toBe('none')
  expect(contentFilter(['Fl' + 'ateDecode'])).toBe('compressed')
  expect(contentFilter(['ASCIIHexDecode'])).toBe('unsupported')
  expect(contentFilter(['Fl' + 'ateDecode', 'ASCII85Decode'])).toBe('unsupported')
})
