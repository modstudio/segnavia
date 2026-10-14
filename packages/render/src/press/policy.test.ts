import { expect, test } from 'bun:test'
import { colorSpaceKind, contentColorSpaceAction, contentFilter, functionAction, groupAction, inlineImageAction, shadingAction } from './policy.ts'

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

test('keeps every press color decision in one policy', () => {
  expect(groupAction('rgb', 'DeviceRGB', false).action).toBe('convert')
  expect(groupAction('rgb', 'DeviceRGB', true).action).toBe('keep')
  expect(groupAction('rgb', 'CalRGB', false).action).toBe('refuse')
  expect(shadingAction('rgb', 2).action).toBe('convert')
  expect(shadingAction('rgb', 1).action).toBe('refuse')
  expect(functionAction(3).action).toBe('keep')
  expect(functionAction(4).action).toBe('refuse')
  expect(inlineImageAction('G', false).action).toBe('keep')
  expect(inlineImageAction('RGB', false).action).toBe('refuse')
  expect(inlineImageAction('I', false).action).toBe('refuse')
  expect(contentColorSpaceAction('Pattern').action).toBe('keep')
  expect(contentColorSpaceAction('DeviceRGB').action).toBe('refuse')
})
