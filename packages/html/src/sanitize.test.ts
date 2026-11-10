import { describe, expect, test } from 'bun:test'
import { assetOriginRefusals, findActiveContent, safeImageSource, sanitize } from './sanitize.ts'

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

describe('srcset image origins', () => {
  const options = { origins: [{ origin: 'https://images.example', kinds: ['image'] as const }] }

  test('keeps an approved img srcset when author scripts are refused', () => {
    const html = '<img srcset="https://images.example/small.png 1x, https://images.example/large.png 2x">'
    expect(sanitize(html, options)).toBe(html)
  })

  test('removes a mixed img srcset and names its first refused origin', () => {
    const refused = 'https://outside.example/large.png'
    const html = `<img srcset="https://images.example/small.png 320w, ${refused} 640w">`
    expect(sanitize(html, options)).toBe('<img>')
    expect(findActiveContent(html, options)).toEqual([expect.stringContaining(`${refused} at origin https://outside.example`)] as string[])
  })

  test('judges a picture source srcset by the same image policy', () => {
    const kept = '<picture><source srcset="https://images.example/wide.png 2x"><img></picture>'
    const removed = '<picture><source srcset="https://outside.example/wide.png 2x"><img></picture>'
    expect(sanitize(kept, options)).toBe(kept)
    expect(sanitize(removed, options)).toBe('<picture><source><img></picture>')
  })

  test('keeps a data-image srcset', () => {
    const html = '<img srcset="data:image/png;base64,AAAA 1x, data:image/webp;base64,BBBB 2x">'
    expect(sanitize(html)).toBe(html)
  })

  test('removes an unapproved srcset with an invalid descriptor', () => {
    const html = '<img srcset="https://outside.example/a.png 3q">'
    expect(sanitize(html, options)).toBe('<img>')
    expect(findActiveContent(html, options)).toEqual([
      'img[srcset] srcset could not establish a readable candidate list; use a valid srcset candidate list or a supported data-image srcset to clear this refusal',
    ])
    expect(assetOriginRefusals(html, options)).toEqual([
      {
        url: 'https://outside.example/a.png 3q',
        kind: 'image',
        reason: 'unreadable-srcset',
        message: 'srcset could not establish a readable candidate list',
        advice: 'use a valid srcset candidate list or a supported data-image srcset to clear this refusal',
      },
    ])
  })

  test('removes an approved srcset candidate with two descriptors', () => {
    const html = '<img srcset="https://images.example/a.png 1x 2x">'
    expect(sanitize(html, options)).toBe('<img>')
  })

  test('removes an empty srcset as before', () => {
    expect(sanitize('<img srcset="">', options)).toBe('<img>')
  })
})

test('CSS fragment references do not name asset fetches', () => {
  const html = '<style>.a{fill:url(#grad);clip-path:url("#clip")}</style><svg><rect style="fill:url(#g2)"/></svg>'
  expect(assetOriginRefusals(html)).toEqual([])
})
