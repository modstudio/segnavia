import { describe, expect, test } from 'bun:test'
import { cssTokens } from './css-tokens.ts'

function kinds(source: string): string[] {
  return cssTokens(source).map(({ kind, value }) => `${kind}:${value}`)
}

describe('CSS tokens', () => {
  test('decodes escapes in identifiers, functions, at-keywords, and unquoted URLs', () => {
    expect(kinds(String.raw`@\69mport u\72l(https\3a //example.test/a.png) s\72 c(`)).toEqual(['at:import', 'url:https://example.test/a.png', 'function:src'])
  })

  test('ends a bad string before a newline but continues one escaped by a backslash', () => {
    expect(kinds('"bad\nurl(x)')).toEqual(['string:bad', 'url:x'])
    expect(kinds('"continued\\\nstring" url(x)')).toEqual(['string:continuedstring', 'url:x'])
    expect(kinds('"bad\r\nurl(x)')).toEqual(['string:bad', 'url:x'])
    expect(kinds('"bad\furl(x)')).toEqual(['string:bad', 'url:x'])
  })

  test('does not join identifier pieces across a comment', () => {
    expect(kinds('u/**/rl(x)')).toEqual(['word:u', 'function:rl', 'word:x', 'close:)'])
  })

  test('consumes unquoted URLs and marks invalid URL contents as bad', () => {
    expect(kinds('url(data:image/png;base64,AA==)')).toEqual(['url:data:image/png;base64,aa=='])
    expect(kinds('url(bad"value) color:red')).toEqual(['bad-url:bad', 'word:color', 'word::', 'word:red'])
    expect(kinds('url(bad(value) color:red')).toEqual(['bad-url:bad', 'word:color', 'word::', 'word:red'])
    expect(kinds('url("quoted.png")')).toEqual(['function:url', 'string:quoted.png', 'close:)'])
  })

  test('an unterminated comment consumes the rest of the input', () => {
    expect(kinds('color:red;/* url(https://example.test/x)')).toEqual(['word:color', 'word::', 'word:red', 'semicolon:;'])
  })
})
