import { describe, expect, test } from 'bun:test'
import { safeImageSource, sanitize } from './sanitize.ts'

const fetches =
  '<svg><image href="https://outside.example/a.png"/><use xlink:href="https://outside.example/s.svg#x"/><filter><feImage href="https://outside.example/f.png"/></filter></svg>'

describe('href fetches', () => {
  test('a link policy does not admit external href fetches', () => {
    const links = { protocols: ['https:', 'mailto:'], fragments: true }
    expect(sanitize(fetches, { links })).toBe('<svg><image/><use/><filter><feImage/></filter></svg>')
  })

  test('the legacy link origin policy does not admit same-origin href fetches', () => {
    const inside = fetches.replaceAll('https://outside.example', 'https://inside.example')
    expect(sanitize(inside, { linkOrigins: ['https://inside.example'] })).toBe('<svg><image/><use/><filter><feImage/></filter></svg>')
  })

  test('a non-link href keeps safe same-document and data image fetches', () => {
    const html = '<svg><use href="#x"/><image href="data:image/png;base64,AAA"/><image href="data:image/bmp;base64,AAA"/></svg>'
    expect(sanitize(html, { links: { protocols: ['https:'], fragments: false } })).toBe(
      '<svg><use href="#x"/><image href="data:image/png;base64,AAA"/><image/></svg>',
    )
    expect(sanitize('<svg><use href="#x"/></svg>', { linkOrigins: ['https://inside.example'] })).toBe('<svg><use href="#x"/></svg>')
  })

  test('judges fetches as the URL parser reads them', () => {
    const html = '<svg><image href="&#127;#x"/><image href="&#127;data:image/png;base64,AAA"/></svg><img src="&#127;data:image/png;base64,AAA">'
    expect(sanitize(html, { links: { protocols: ['https:'] } })).toBe('<svg><image/><image/></svg><img>')
    expect(safeImageSource('\x7fdata:image/png;base64,AAA')).toBe(false)
    expect(safeImageSource('\tdata:image/png;base64,AAA')).toBe(true)
    expect(safeImageSource(' data:image/png;base64,AAA')).toBe(true)
  })

  test('still refuses a link whose parser-readable scheme is javascript', () => {
    expect(sanitize('<a href="java&#9;script:alert(1)">x</a>', { links: { protocols: ['https:'] } })).toBe('<a>x</a>')
  })

  test('an SVG link remains governed by LinkPolicy', () => {
    const html = '<svg><a href="https://outside.example">outside</a></svg>'
    expect(sanitize(html, { links: { protocols: ['https:'] } })).toBe(html)
    expect(sanitize(html, { links: { protocols: ['mailto:'] } })).toBe('<svg><a>outside</a></svg>')
  })
})
