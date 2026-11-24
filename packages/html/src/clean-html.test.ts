import { describe, expect, test } from 'bun:test'
import { cleanHtml } from './clean-html.ts'
import type { HtmlProfile } from './html-profile.ts'

const profile = {
  blocks: { p: true },
  marks: ['bold', 'italic', 'link'],
  links: { schemes: ['https', 'mailto'] },
  align: ['start', 'center', 'end'],
  direction: true,
} satisfies HtmlProfile

describe('cleanHtml', () => {
  test('applies active-content refusals and reports their original paths', () => {
    expect(cleanHtml('<p onclick="go()">safe<script>alert(1)</script><a href="javascript:go()">link</a></p>', profile)).toEqual({
      html: '<p>safelink</p>',
      dropped: [
        { kind: 'attribute', name: 'onclick', path: 'p[1]' },
        { kind: 'element', name: 'script', path: 'p[1]/script[1]' },
        { kind: 'scheme', name: 'javascript', path: 'p[1]/a[1]' },
      ],
    })
  })

  test('unwraps an unadmitted inline element and indexes same-name siblings', () => {
    expect(cleanHtml('<p><u>one</u><em><u>two</u></em><u>three</u></p>', profile)).toEqual({
      html: '<p>one<em>two</em>three</p>',
      dropped: [
        { kind: 'element', name: 'u', path: 'p[1]/u[1]' },
        { kind: 'element', name: 'u', path: 'p[1]/em[1]/u[1]' },
        { kind: 'element', name: 'u', path: 'p[1]/u[2]' },
      ],
    })
  })

  test('unwraps a link whose scheme the profile does not admit', () => {
    expect(cleanHtml('<p><a href="tel:+12125550100">call</a></p>', profile)).toEqual({
      html: '<p>call</p>',
      dropped: [{ kind: 'scheme', name: 'tel', path: 'p[1]/a[1]' }],
    })
  })

  test('keeps only admitted logical alignment declarations', () => {
    expect(cleanHtml('<p style="color:red;text-align:left; text-align:center">text</p>', profile)).toEqual({
      html: '<p style="text-align:center">text</p>',
      dropped: [
        { kind: 'style', name: 'color', path: 'p[1]' },
        { kind: 'style', name: 'text-align', path: 'p[1]' },
      ],
    })
  })

  test('bounds reports without bounding cleaning', () => {
    const source = `<p>${'<u>x</u>'.repeat(300)}</p>`
    const result = cleanHtml(source, profile)
    expect(result.dropped).toHaveLength(256)
    expect(result.dropped[255]).toEqual({ kind: 'element', name: 'u', path: 'p[1]/u[256]' })
    expect(result.html).toBe(`<p>${'x'.repeat(300)}</p>`)
  })

  test('is a fixed point and converts standard block elements only when p is admitted', () => {
    const once = cleanHtml('<div><span>text</span></div>', profile)
    expect(once).toEqual({
      html: '<p>text</p>',
      dropped: [
        { kind: 'element', name: 'div', path: 'div[1]' },
        { kind: 'element', name: 'span', path: 'div[1]/span[1]' },
      ],
    })
    expect(cleanHtml(once.html, profile)).toEqual({ html: once.html, dropped: [] })
    expect(cleanHtml('<div><span>text</span></div>', { blocks: {}, marks: [] })).toEqual({
      html: 'text',
      dropped: [
        { kind: 'element', name: 'div', path: 'div[1]' },
        { kind: 'element', name: 'span', path: 'div[1]/span[1]' },
      ],
    })
  })

  test('flattens nested unadmitted blocks into admitted paragraph siblings', () => {
    for (const source of ['<div><div>x</div></div>', '<table><tbody><tr><td>x</td></tr></tbody></table>']) {
      const once = cleanHtml(source, profile)
      expect(once.html).toBe('<p>x</p>')
      expect(cleanHtml(once.html, profile)).toEqual({ html: once.html, dropped: [] })
    }

    expect(cleanHtml('<div>a<p>b</p>c</div>', profile)).toEqual({
      html: '<p>a</p><p>b</p><p>c</p>',
      dropped: [{ kind: 'element', name: 'div', path: 'div[1]' }],
    })
  })

  test('removes comments and reports their parent path', () => {
    expect(cleanHtml('<p>a<!-- note -->b</p>', profile)).toEqual({
      html: '<p>ab</p>',
      dropped: [{ kind: 'element', name: '#comment', path: 'p[1]' }],
    })
  })

  test('round-trips Hebrew direction when admitted', () => {
    expect(cleanHtml('<p dir="rtl">שלום</p>', profile)).toEqual({ html: '<p dir="rtl">שלום</p>', dropped: [] })
  })

  test('treats only own profile element properties as admitted', () => {
    for (const name of ['constructor', 'toString']) {
      expect(cleanHtml(`<${name}>x</${name}>`, profile)).toEqual({
        html: 'x',
        dropped: [{ kind: 'element', name: name.toLowerCase(), path: `${name.toLowerCase()}[1]` }],
      })
    }
  })

  test('removes content that is not document text', () => {
    for (const name of ['style', 'title', 'template', 'noscript', 'head']) {
      expect(cleanHtml(`<${name}>hidden</${name}><p>x</p>`, profile)).toEqual({
        html: '<p>x</p>',
        dropped: [{ kind: 'element', name, path: `${name}[1]` }],
      })
    }
  })

  test('reports refused links without schemes as attribute drops', () => {
    const noLinks = { blocks: { p: true }, marks: ['link'] } satisfies HtmlProfile
    for (const href of ['/page', '#x', 'foo']) {
      expect(cleanHtml(`<p><a href="${href}">x</a></p>`, noLinks)).toEqual({
        html: '<p>x</p>',
        dropped: [{ kind: 'attribute', name: 'href', path: 'p[1]/a[1]' }],
      })
    }
  })

  test('does not keep block elements inside phrasing containers', () => {
    const once = cleanHtml('<p>a<span><div>b</div></span>c</p>', profile)
    expect(once).toEqual({
      html: '<p>abc</p>',
      dropped: [
        { kind: 'element', name: 'span', path: 'p[1]/span[1]' },
        { kind: 'element', name: 'div', path: 'p[1]/span[1]/div[1]' },
      ],
    })
    expect(cleanHtml(once.html, profile)).toEqual({ html: once.html, dropped: [] })

    const listProfile = { blocks: { ul: true }, marks: [] } satisfies HtmlProfile
    expect(cleanHtml('<ul><li>a<ul><li>b</li></ul></li></ul>', listProfile)).toEqual({
      html: '<ul><li>a<ul><li>b</li></ul></li></ul>',
      dropped: [],
    })
  })

  test('normalizes Tiptap single-paragraph list items without reporting a drop', () => {
    const listProfile = { blocks: { ul: true }, marks: ['bold'] } satisfies HtmlProfile
    expect(cleanHtml('<ul><li><p>one <strong>two</strong></p></li></ul>', listProfile)).toEqual({
      html: '<ul><li>one <strong>two</strong></li></ul>',
      dropped: [],
    })
  })

  test('keeps empty admitted elements in converted inline runs', () => {
    expect(cleanHtml('<div><strong></strong></div>', profile)).toEqual({
      html: '<p><strong></strong></p>',
      dropped: [{ kind: 'element', name: 'div', path: 'div[1]' }],
    })
  })

  test('drops alignment and direction when the profile admits neither', () => {
    expect(
      cleanHtml('<p dir="rtl" style="text-align:center">text</p>', {
        blocks: { p: true },
        marks: [],
      }),
    ).toEqual({
      html: '<p>text</p>',
      dropped: [
        { kind: 'style', name: 'text-align', path: 'p[1]' },
        { kind: 'attribute', name: 'dir', path: 'p[1]' },
      ],
    })
  })
})
