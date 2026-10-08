import { describe, expect, test } from 'bun:test'
import { classify, fill, findActiveContent, sanitize } from './index.ts'

const prefix = 'demo'

describe('sanitize', () => {
  test('a scheme hidden behind a control character is still refused', () => {
    expect(sanitize('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  test('a link survives only to an allowed https origin', () => {
    const html = '<a href="https://ok.example/p">a</a><a href="https://other.example/">b</a><a href="#top">c</a>'
    expect(sanitize(html, { linkOrigins: ['https://ok.example'] })).toBe('<a href="https://ok.example/p">a</a><a>b</a><a href="#top">c</a>')
  })

  test('an image may only be inline data, in src and in style alike', () => {
    expect(sanitize('<img src="https://x.example/a.png"><div style="background:url(https://x.example/b.png)"></div>')).toBe('<img><div></div>')
    expect(sanitize('<img src="data:image/png;base64,AA==">')).toBe('<img src="data:image/png;base64,AA==">')
  })

  test('a style element is refused when its CSS imports or fetches content', () => {
    const unsafe = '<style>@IMPORT url(data:image/png;base64,AA==)</style>'
    const external = '<style>p{background:url(https://example.com/b.png)}</style>'
    const safe = '<style>p{background:url(data:image/png;base64,AA==)}</style>'
    expect(findActiveContent(unsafe)).toEqual(['<style>'])
    expect(sanitize(unsafe)).toBe('')
    expect(sanitize(unsafe, { keepScripts: true })).toBe('')
    expect(findActiveContent(external)).toEqual(['<style>'])
    expect(sanitize(external)).toBe('')
    expect(findActiveContent(safe)).toEqual([])
    expect(sanitize(safe)).toBe(safe)
    expect(sanitize(safe, { keepScripts: true })).toBe(safe)
  })

  test('a refused element goes with its content; scripts stay only when asked', () => {
    expect(sanitize('<p>a</p><script>x()</script><form><input></form>')).toBe('<p>a</p>')
    expect(sanitize('<p onclick="x()">a</p><script>x()</script>', { keepScripts: true })).toBe('<p onclick="x()">a</p><script>x()</script>')
  })

  test('meta http-equiv is refused, since it can set policy from inside the page', () => {
    expect(findActiveContent('<meta http-equiv="refresh" content="0;url=https://x">')).toEqual(['<meta>'])
  })
})

describe('bindings', () => {
  test('a repeat reads its item, and ../ reads the page around it', () => {
    const html = `<ul><li data-demo-each="rows"><b data-demo-value="name"></b> of <i data-demo-value="../title"></i></li></ul>`
    const { html: out } = fill(html, { prefix, data: { title: 'T', rows: [{ name: 'a' }, { name: 'b' }] } })
    expect(out).toBe('<ul><li><b dir="auto">a</b> of <i dir="auto">T</i></li><li><b dir="auto">b</b> of <i dir="auto">T</i></li></ul>')
  })

  test('a dotted key wins over nesting, so both data shapes resolve', () => {
    expect(fill('<p data-demo-value="a.b"></p>', { prefix, data: { 'a.b': 'flat' } }).html).toBe('<p dir="auto">flat</p>')
    expect(fill('<p data-demo-value="a.b"></p>', { prefix, data: { a: { b: 'nested' } } }).html).toBe('<p dir="auto">nested</p>')
  })

  test('missing data is reported, not silently printed as empty', () => {
    const filled = fill('<p data-demo-value="goal"></p><p data-demo-each="rows"></p>', { prefix, data: {} })
    expect(filled.unavailable.sort()).toEqual(['goal', 'rows'])
  })

  test('present and when remove what does not apply', () => {
    const html = '<p data-demo-present="note">n</p><ul><li data-demo-each="items"><span data-demo-when="open">open</span></li></ul>'
    expect(fill(html, { prefix, data: { note: '', items: [{ state: 'open' }, { state: 'closed' }] } }).html).toBe(
      '<ul><li><span>open</span></li><li></li></ul>',
    )
  })

  test('a bound link or image obeys the same rule as a written one', () => {
    const html = '<a data-demo-href="link">x</a><img data-demo-src="pic">'
    const filled = fill(html, { prefix, data: { link: 'https://evil.example/', pic: 'https://x.example/a.png' }, linkOrigins: ['https://ok.example'] })
    expect(filled.html).toBe('<a>x</a><img>')
    expect(filled.unavailable.sort()).toEqual(['link', 'pic'])
  })

  test('width clamps to a percentage', () => {
    expect(fill('<div data-demo-width="p"></div>', { prefix, data: { p: 140 } }).html).toBe('<div style="width: 100%"></div>')
  })
})

describe('classify', () => {
  test('a page that both runs code and binds data is refused', () => {
    expect(classify('<p>x</p>', prefix)).toBe('plain')
    expect(classify('<p data-demo-value="a"></p>', prefix)).toBe('live-data')
    expect(classify('<script>1</script>', prefix)).toBe('scripted')
    expect(classify('<script>1</script><p data-demo-value="a"></p>', prefix)).toBe('refused')
  })
})

describe('bidi in bindings', () => {
  test('a filled-in value is isolated in its own direction, unless the author set one', () => {
    const html = '<p>Hello <b data-demo-value="name"></b>, welcome.</p><p dir="rtl" data-demo-value="name"></p>'
    expect(fill(html, { prefix, data: { name: 'שרה' } }).html).toBe('<p>Hello <b dir="auto">שרה</b>, welcome.</p><p dir="rtl">שרה</p>')
  })
})
