import { expect, test } from 'bun:test'
import {
  colorSpaceKind,
  colorSpaceLabel,
  contentColorSpaceAction,
  contentFilter,
  contentOperatorAction,
  groupAction,
  inlineImageAction,
  shadingAction,
  shadingFunctionAction,
} from './policy.ts'

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
  expect(contentFilter(undefined).encoding).toBe('none')
  expect(contentFilter(['Fl' + 'ateDecode']).encoding).toBe('compressed')
  expect(contentFilter(['ASCIIHexDecode']).action).toBe('refuse')
  expect(contentFilter(['Fl' + 'ateDecode', 'ASCII85Decode']).action).toBe('refuse')
})

test('keeps every press color decision in one policy', () => {
  expect(groupAction('rgb', 'DeviceRGB', false).action).toBe('convert')
  expect(groupAction('rgb', 'DeviceRGB', true).action).toBe('keep')
  expect(groupAction('rgb', 'CalRGB', false).action).toBe('refuse')
  expect(shadingAction('rgb', 2).action).toBe('convert')
  expect(shadingAction('rgb', 1).action).toBe('refuse')
  expect(shadingFunctionAction(3, true, true).action).toBe('keep')
  expect(shadingFunctionAction(3, true, false).found).toBe('FunctionType 3 Functions missing')
  expect(shadingFunctionAction(4, true, true).action).toBe('refuse')
  expect(inlineImageAction('G', false).action).toBe('keep')
  expect(inlineImageAction('RGB', false).action).toBe('refuse')
  expect(inlineImageAction('I', false).action).toBe('refuse')
  expect(contentColorSpaceAction('Pattern').action).toBe('keep')
  expect(contentColorSpaceAction('DeviceRGB').action).toBe('refuse')
  expect(contentOperatorAction('rg', false).action).toBe('convert')
  expect(contentOperatorAction('rg', true).action).toBe('refuse')
  expect(contentOperatorAction('k', true).action).toBe('keep')
  expect(contentOperatorAction('scn', false, undefined, true).action).toBe('keep')
  expect(contentOperatorAction('sc', false, undefined, true).action).toBe('refuse')
  expect(colorSpaceLabel({ name: 'author-controlled' })).toBe('other')
})
