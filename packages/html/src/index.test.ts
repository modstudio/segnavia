import { describe, expect, test } from 'bun:test'
import { assetOriginRefusals, classify, fill, findActiveContent, safeMarkdownUrl, sanitize } from './index.ts'

const prefix = 'demo'

describe('sanitize', () => {
  test('asset preflight names unapproved markup and CSS image origins', () => {
    const url = 'https://outside.example/image.png'
    const findings = assetOriginRefusals(`<img src="${url}"><p style="background-image:url(${url})">x</p><style>p{mask:url(${url})}</style>`)
    expect(findings).toHaveLength(3)
    expect(findings.every((finding) => finding.includes(`${url} at origin https://outside.example is not approved for image`))).toBe(true)
  })

  test('the markdown URL rule optionally restricts link origins', () => {
    expect(safeMarkdownUrl('href', 'mailto:editor@example.com')).toBe(true)
    expect(safeMarkdownUrl('href', 'https://outside.example/x', ['https://inside.example'])).toBe(false)
    expect(safeMarkdownUrl('href', 'https://inside.example/x', ['https://inside.example'])).toBe(true)
    expect(safeMarkdownUrl('href', 'https://exa mple.com/x', ['https://inside.example'])).toBe(false)
    expect(safeMarkdownUrl('src', 'data:image/png;base64,AA==', [{ origin: 'https://inside.example', kinds: ['image'] }])).toBe(true)
    expect(safeMarkdownUrl('href', 'javascript:alert(1)')).toBe(false)
  })

  test('a scheme hidden behind a control character is still refused', () => {
    expect(sanitize('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  test('a link survives only to an allowed https origin', () => {
    const html = '<a href="https://ok.example/p">a</a><a href="https://other.example/">b</a><a href="#top">c</a>'
    expect(sanitize(html, { linkOrigins: ['https://ok.example'] })).toBe('<a href="https://ok.example/p">a</a><a>b</a><a href="#top">c</a>')
  })

  test('a host link policy selects protocols, origins, and fragments', () => {
    const html =
      '<a href="mailto:editor@example.com">mail</a><a href="https://ok.example/p">ok</a><a href="https://other.example/p">other</a><a href="#top">top</a>'
    const links = { protocols: ['https:', 'mailto:'], origins: ['https://ok.example'], fragments: false }
    expect(sanitize(html, { links })).toBe('<a href="mailto:editor@example.com">mail</a><a href="https://ok.example/p">ok</a><a>other</a><a>top</a>')
  })

  test('links overrides the legacy linkOrigins option', () => {
    const html = '<a href="https://new.example/p">new</a><a href="https://old.example/p">old</a>'
    const links = { protocols: ['https:'], origins: ['https://new.example'] }
    expect(sanitize(html, { links, linkOrigins: ['https://old.example'] })).toBe('<a href="https://new.example/p">new</a><a>old</a>')
    expect(
      fill('<a data-demo-href="link">new</a>', { prefix, links, linkOrigins: ['https://old.example'], data: { link: 'https://new.example/p' } }).html,
    ).toBe('<a href="https://new.example/p">new</a>')
  })

  test('links decides authored hrefs when a converter policy is also supplied', () => {
    const converterPolicy = {
      urls: { linkProtocols: ['https:'], linkFragments: true, dataImages: false },
      inertControls: [],
    }
    expect(sanitize('<a href="mailto:a@b.c">m</a>', { links: { protocols: ['https:', 'mailto:'] }, converterPolicy })).toBe('<a href="mailto:a@b.c">m</a>')
  })

  test('active-content findings follow the host link policy', () => {
    const html = '<a href="mailto:a@b.c">x</a>'
    expect(findActiveContent(html, { links: { protocols: ['mailto:'] } })).toEqual([])
    expect(findActiveContent(html)).toEqual(['a[href]'])
  })

  test('an image may only be inline data, in src and in style alike', () => {
    expect(sanitize('<img src="https://x.example/a.png"><div style="background:url(https://x.example/b.png)"></div>')).toBe('<img><div></div>')
    expect(sanitize('<img src="data:image/png;base64,AA==">')).toBe('<img src="data:image/png;base64,AA==">')
  })

  test('a refused-script page keeps only images approved for the image kind and names a refused origin', () => {
    const approved = 'https://images.example/approved.png'
    const refused = 'https://outside.example/refused.png'
    const options = { origins: [{ origin: 'https://images.example', kinds: ['image'] as const }] }
    const html = `<img src="${approved}"><img src="${refused}">`
    expect(sanitize(html, options)).toBe(`<img src="${approved}"><img>`)
    expect(findActiveContent(html, options)).toEqual([expect.stringContaining(`${refused} at origin https://outside.example`)] as string[])
  })

  test('materializes one-shot origin approvals for every sanitized image', () => {
    function* origins() {
      yield { origin: 'https://images.example', kinds: ['image'] as const }
    }
    const html = '<img src="https://images.example/a.png"><img src="https://images.example/b.png">'
    expect(sanitize(html, { origins: origins() })).toBe(html)
  })

  test('a style element removes only the rule or declaration that fetches content', () => {
    const unsafe = '<style>@IMPORT url(data:image/png;base64,AA==)</style>'
    const external = '<style>p{background:url(https://example.com/b.png)}</style>'
    const safe = '<style>p{background:url(data:image/png;base64,AA==)}</style>'
    expect(findActiveContent(unsafe)).toEqual(['<style> @import'])
    expect(sanitize(unsafe)).toBe('<style></style>')
    expect(sanitize(unsafe, { keepScripts: true })).toBe('<style></style>')
    expect(findActiveContent(external)).toEqual(['<style> url()'])
    expect(sanitize(external)).toBe('<style>p{}</style>')
    expect(findActiveContent(safe)).toEqual([])
    expect(sanitize(safe)).toBe(safe)
    expect(sanitize(safe, { keepScripts: true })).toBe(safe)
  })

  test('CSS fetch spellings are decoded and named', () => {
    const css = String.raw`<style>
      a { color: red; background: u\72l(https://example.com/a.png); }
      b { color: blue; background: image-set("https://example.com/b.png" 1x); }
      c { color: green; background: s\72 c(https://example.com/c.png); }
    </style>`
    expect(findActiveContent(css)).toEqual(['<style> url()', '<style> image-set()', '<style> src()'])
    expect(sanitize(css)).toBe(`<style>
      a { color: red;  }
      b { color: blue;  }
      c { color: green;  }
    </style>`)
  })

  test('comments cannot split a fetching function name', () => {
    const css = '<style>a{color:red;background:u/**/r/**/l(https://example.com/a.png)}</style>'
    expect(findActiveContent(css)).toEqual(['<style> url()'])
    expect(sanitize(css)).toBe('<style></style>')
  })

  test('an author data font is a host option and an external face is always removed', () => {
    const embedded = '<style>@font-face{font-family:Example;src:url(data:font/woff2;base64,AA==)}p{font-family:Example}</style>'
    const applicationFont = '<style>@font-face{font-family:Example;src:url(data:application/x-font-woff;base64,AA==)}</style>'
    const external = '<style>@font-face{font-family:Example;src:url(https://example.com/font.woff2)}p{color:red}</style>'
    expect(findActiveContent(embedded)).toEqual(['<style> data font'])
    expect(findActiveContent(embedded, { dataFonts: true })).toEqual([])
    expect(findActiveContent(applicationFont, { dataFonts: true })).toEqual([])
    expect(findActiveContent(external, { dataFonts: true })).toEqual(['<style> url()'])
    expect(sanitize(embedded)).toBe('<style>p{font-family:Example}</style>')
    expect(sanitize(embedded, { dataFonts: true })).toBe(embedded)
    expect(sanitize(applicationFont, { dataFonts: true })).toBe(applicationFont)
    expect(sanitize(external, { dataFonts: true })).toBe('<style>p{color:red}</style>')
  })

  test('a style element cleans its joined text children', () => {
    const html = '<style>p{color:red}<!-- split -->q{background:url(https://example.com/a.png)}</style>'
    expect(findActiveContent(html)).toEqual(['<style> url()'])
    expect(sanitize(html)).toBe('<style>p{color:red}<!-- split -->q{}</style>')
  })

  test('an inline style loses only an unsafe declaration', () => {
    const html = '<p style="color:red;background:url(https://example.com/a.png);font-weight:bold">x</p>'
    expect(findActiveContent(html)).toEqual(['p[style] url()'])
    expect(sanitize(html)).toBe('<p style="color:red;font-weight:bold">x</p>')
  })

  test('nested rules keep their safe declarations and surrounding rules', () => {
    const html =
      '<style>@media (min-width:1px){a{color:red;background:url(https://example.com/a.png)}b{color:blue}}a{&:hover{background:url(https://example.com/b.png);color:red}font-weight:bold}</style>'
    expect(sanitize(html)).toBe('<style>@media (min-width:1px){a{color:red;}b{color:blue}}a{&:hover{color:red}font-weight:bold}</style>')
  })

  test('a refused element goes with its content; scripts stay only when asked', () => {
    expect(sanitize('<p>a</p><script>x()</script><form><input></form>')).toBe('<p>a</p>')
    expect(sanitize('<p onclick="x()">a</p><script>x()</script>', { keepScripts: true })).toBe('<p onclick="x()">a</p><script>x()</script>')
  })

  test('scripted pages keep controls but never form destinations', () => {
    const controls =
      '<form action="/send"><input><button formaction="/other">Send</button><select><option>One</option></select><textarea>Text</textarea></form>'
    expect(findActiveContent(controls)).toEqual(['<form>', 'form[action]', '<input>', '<button>', 'button[formaction]', '<select>', '<textarea>'])
    expect(sanitize(controls)).toBe('')
    expect(findActiveContent(controls, { keepScripts: true })).toEqual(['form[action]', 'button[formaction]'])
    expect(sanitize(controls, { keepScripts: true })).toBe(
      '<form><input><button>Send</button><select><option>One</option></select><textarea>Text</textarea></form>',
    )
  })

  test('scripted pages keep only approved pinned dependencies and both sanitizer paths agree', () => {
    const pinned = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.js'
    const ranged = 'https://cdn.jsdelivr.net/npm/chart.js@^4/dist/chart.js'
    const options = { keepScripts: true, origins: [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] as const }] }
    const html = `<script src="${pinned}" integrity="sha384-ok"></script><script src="${ranged}"></script><script src="https://evil.example/a@1.2.3.js"></script>`
    const findings = findActiveContent(html, options)
    expect(findings).toHaveLength(2)
    expect(findings[0]).toContain('exact x.y.z package version')
    expect(findings[1]).toContain('origins')
    const cleaned = sanitize(html, options)
    expect(cleaned).toContain(`src="${pinned}" integrity="sha384-ok"`)
    expect(cleaned).not.toContain(ranged)
    expect(cleaned).not.toContain('evil.example')
    expect(findActiveContent(cleaned, options)).toEqual([])
    expect(sanitize(`<script src="${pinned}"></script>`, { keepScripts: true })).toContain(`src="${pinned}"`)
  })

  test('scripted dependency policy keeps stylesheets, imports, and font files but drops preconnect', () => {
    const options = { keepScripts: true }
    const html =
      '<link rel="preconnect" href="https://fonts.gstatic.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><style>@import url(https://fonts.googleapis.com/css2?family=Inter);@font-face{font-family:Inter;src:url(https://fonts.gstatic.com/s/inter/v1/font.woff2)}</style>'
    const cleaned = sanitize(html, options)
    expect(cleaned).not.toContain('preconnect')
    expect(cleaned).toContain('rel="stylesheet"')
    expect(cleaned).toContain('@import url(https://fonts.googleapis.com/css2?family=Inter);')
    expect(cleaned).toContain('url(https://fonts.gstatic.com/s/inter/v1/font.woff2)')
    expect(findActiveContent(cleaned, options)).toEqual([])
  })

  test('keeps an approved import condition', () => {
    const css = '@import url(https://fonts.googleapis.com/css2?family=Inter) print;'
    const cleaned = sanitize(`<style>${css}</style>`)
    expect(cleaned).toContain(css)
  })

  test('meta http-equiv is refused, since it can set policy from inside the page', () => {
    expect(findActiveContent('<meta http-equiv="refresh" content="0;url=https://x">')).toEqual(['<meta>'])
  })
})

describe('bindings', () => {
  test('fill keeps the legacy authored-link rule when no link policy is supplied', () => {
    expect(fill('<a href="mailto:editor@example.com">Email</a>', { prefix, data: {} }).html).toBe('<a>Email</a>')
  })

  test('keeps an author data font through fill only when opted in', () => {
    const html = '<style>@font-face{font-family:x;src:url(data:font/woff2;base64,AA==)}</style><p data-demo-value="name"></p>'
    expect(fill(html, { prefix, data: { name: 'held' } }).html).not.toContain('@font-face')
    expect(fill(html, { prefix, data: { name: 'held' }, dataFonts: true }).html).toContain('@font-face')
  })

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

  test('one host link policy judges authored and bound hrefs alike', () => {
    const links = { protocols: ['mailto:'], fragments: true }
    const html = '<a href="mailto:author@example.com">author</a><a data-demo-href="bound">bound</a><a data-demo-href="fragment">fragment</a>'
    const filled = fill(html, { prefix, links, data: { bound: 'mailto:bound@example.com', fragment: '#details' } })
    expect(filled.html).toBe('<a href="mailto:author@example.com">author</a><a href="mailto:bound@example.com">bound</a><a href="#details">fragment</a>')
    expect(filled.unavailable).toEqual([])
  })

  test('bound fragments and mailto links stay refused by default', () => {
    const filled = fill('<a data-demo-href="link">details</a><a data-demo-href="mail">mail</a>', {
      prefix,
      data: { link: '#details', mail: 'mailto:a@example.com' },
    })
    expect(filled.html).toBe('<a>details</a><a>mail</a>')
    expect(filled.unavailable.sort()).toEqual(['link', 'mail'])
  })

  test('a malformed bound link is dropped and reported unavailable', () => {
    const filled = fill('<a data-demo-href="link">details</a>', {
      prefix,
      data: { link: 'https://in side.example/x' },
      linkOrigins: ['https://inside.example'],
    })
    expect(filled.html).toBe('<a>details</a>')
    expect(filled.unavailable).toEqual(['link'])
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
