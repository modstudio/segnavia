import { expect, test } from 'bun:test'
import { parseUnicodeRange } from './unicode-range.ts'

test.each([
  ['U+41', 'U+41'],
  ['u+41', 'U+41'],
  ['U+ab', 'U+AB'],
  ['U+0', 'U+0'],
  ['U+10FFFF', 'U+10FFFF'],
  ['U+000000', 'U+000000'],
  ['U+0590-05FF', 'U+0590-05FF'],
  ['U+0590-05ff', 'U+0590-05FF'],
  ['U+10-10', 'U+10-10'],
  ['U+0000-024F', 'U+0000-024F'],
  ['U+0-10FFFF', 'U+0-10FFFF'],
  ['U+?', 'U+?'],
  ['U+00??', 'U+00??'],
  ['U+10????', 'U+10????'],
  ['u+fb1d-fb4f', 'U+FB1D-FB4F'],
  ['U+0590-05FF, U+FB1D-FB4F', 'U+0590-05FF, U+FB1D-FB4F'],
  ['U+0590-05FF,U+FB1D-FB4F', 'U+0590-05FF, U+FB1D-FB4F'],
  [' U+41 ,  U+42 ', 'U+41, U+42'],
])('parseUnicodeRange(%j) normalizes to %j', (range, value) => {
  expect(parseUnicodeRange(range)).toEqual({ ok: true, value })
})

test.each([
  ['', 'the list is empty'],
  ['   ', 'the list is empty'],
  ['U+41,', 'the list has an empty entry'],
  [',U+41', 'the list has an empty entry'],
  ['U+41,,U+42', 'the list has an empty entry'],
  ['U+', 'U+ is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards)'],
  ['U+G', 'U+G is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards)'],
  ['U+1234567', 'U+1234567 is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards)'],
  ['U+A?B', 'U+A?B is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards)'],
  ['U+00??-01??', 'U+00??-01?? is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards)'],
  ['not-a-range', 'not-a-range is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards)'],
  ['U+ 41', 'U+ 41 is not a CSS unicode-range descriptor (U+hex, U+hex-hex, or U+hex with ? wildcards)'],
  ['U+20-10', 'U+20-10 has start greater than end'],
  ['U+110000', 'U+110000 has a code point above 10FFFF'],
  ['U+ABCDEF', 'U+ABCDEF has a code point above 10FFFF'],
  ['U+0-110000', 'U+0-110000 has a code point above 10FFFF'],
  ['U+??????', 'U+?????? has a code point above 10FFFF'],
  ['U+1?????', 'U+1????? has a code point above 10FFFF'],
  ['U+11????', 'U+11???? has a code point above 10FFFF'],
])('parseUnicodeRange(%j) is malformed: %s', (range, reason) => {
  expect(parseUnicodeRange(range)).toEqual({ ok: false, reason })
})
