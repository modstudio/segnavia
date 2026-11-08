import { describe, expect, test } from 'bun:test'
import { StyleSheet } from '@segnavia/format'
import { compileStyleSheet } from './style-compile.ts'

const sheet = (value: unknown) => StyleSheet.parse(value)

function compiled(brand: unknown, document: unknown): string[] {
  const result = compileStyleSheet({ brand: sheet(brand), document: sheet(document) })
  expect(result.ok).toBe(true)
  return result.ok ? result.sheets : []
}

describe('compileStyleSheet', () => {
  test('orders layers, emits origin tokens and flattens styles with logical properties', () => {
    const sheets = compiled(
      {
        tokens: {
          colors: { ink: '#123456' },
          dimensions: { leading: { value: 14, unit: 'pt' } },
          fontFamilies: { body: ['Noto Serif', 'serif'] },
        },
        textStyles: {
          base: { kind: 'paragraph', color: { token: 'ink' }, fontFamily: { token: 'body' }, spaceBefore: { value: 3, unit: 'mm' } },
        },
      },
      {
        tokens: { dimensions: { body: { value: 11, unit: 'pt' } } },
        textStyles: { body: { kind: 'paragraph', basedOn: 'base', fontSize: { token: 'body' }, textAlign: 'start' } },
      },
    )
    expect(sheets).toHaveLength(2)
    expect(sheets[0]?.startsWith('@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;')).toBe(true)
    expect(sheets[0]).toContain(':root{--segnavia-color-ink:#123456;--segnavia-size-leading:14pt;--segnavia-family-body:"Noto Serif",serif}')
    expect(sheets[0]).toContain('.segnavia-style-base{font-family:var(--segnavia-family-body);color:var(--segnavia-color-ink);margin-block-start:3mm}')
    expect(sheets[1]).toBe(
      '@layer segnavia.document{:root{--segnavia-size-body:11pt}.segnavia-style-body{font-family:var(--segnavia-family-body);font-size:var(--segnavia-size-body);color:var(--segnavia-color-ink);text-align:start;margin-block-start:3mm}}',
    )
  })

  test('does not leak a replaced brand property into the compiled document class', () => {
    const sheets = compiled(
      { textStyles: { body: { kind: 'paragraph', color: '#111111', fontStyle: 'italic' } } },
      { textStyles: { body: { kind: 'paragraph', fontWeight: 700 } } },
    )
    expect(sheets[1]).toBe('@layer segnavia.document{.segnavia-style-body{font-weight:700}}')
    expect(sheets.join('')).not.toContain('color:#111111')
    expect(sheets.join('')).not.toContain('font-style:italic')
  })

  test('sanitizes free css before keeping author layers nested and escapes style termination', () => {
    const sheets = compiled(
      { css: '@import "https://example.test/brand.css";.brand{background:url(https://example.test/a.png);color:red}' },
      { css: '@layer x{.x{color:blue}}.end{content:"</style><script>bad</script>"}' },
    )
    expect(sheets[1]).toBe('@layer segnavia.brand{.brand{color:red}}')
    expect(sheets[3]).toContain('@layer segnavia.author{@layer x{.x{color:blue}}')
    expect(sheets[3]).toContain('content:"\\3c /style>\\3c script>bad\\3c /script>"')
    expect(sheets.join('')).not.toContain('@import')
    expect(sheets.join('')).not.toContain('url(')
    expect(sheets.join('')).not.toContain('</style>')
  })

  test('keeps unmatched closing braces in document and brand css inside their layers', () => {
    const freeCss = 'a{color:blue} } body{color:red}'
    const documentSheets = compiled({}, { css: freeCss })
    const brandSheets = compiled({ css: freeCss }, {})

    expect(documentSheets).toEqual([
      '@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;@layer segnavia.base{}@layer segnavia.brand{}',
      '@layer segnavia.document{}',
      '@layer segnavia.author{a{color:blue}  body{color:red}}',
    ])
    expect(brandSheets).toEqual([
      '@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;@layer segnavia.base{}@layer segnavia.brand{}',
      '@layer segnavia.brand{a{color:blue}  body{color:red}}',
      '@layer segnavia.document{}',
    ])
  })

  test('closes an unfinished free css block inside its layer', () => {
    const sheets = compiled({}, { css: 'a{color:blue' })

    expect(sheets[2]).toBe('@layer segnavia.author{a{color:blue}}')
  })

  test('keeps a closing brace inside a free css string while dropping an unmatched brace', () => {
    const sheets = compiled({}, { css: 'a::after{content:"}"} } body{color:red}' })

    expect(sheets[2]).toBe('@layer segnavia.author{a::after{content:"}"}  body{color:red}}')
  })

  test('escapes newlines in quoted font family names', () => {
    const sheets = compiled({}, { tokens: { fontFamilies: { x: ['A B\n}} body{color:red}'] } } })

    expect(sheets[1]).toContain('--segnavia-family-x:"A B\\a }} body{color:red}"')
    expect(sheets.join('')).not.toContain('\n')
  })

  test('keeps unfinished free css in its own sheet', () => {
    const unfinishedCss = ['a{content:"x', 'a{content:"x\\', 'a{color:red} /* open', 'a{b:calc(1px']
    const document = { textStyles: { body: { kind: 'paragraph', color: '#000000' } } }
    const typedDocumentSheet = '@layer segnavia.document{.segnavia-style-body{color:#000000}}'

    for (const css of unfinishedCss) {
      const brandSheets = compiled({ css }, document)
      const documentSheets = compiled({}, { ...document, css })

      expect(brandSheets).toHaveLength(3)
      expect(brandSheets[1]).toStartWith('@layer segnavia.brand{')
      expect(brandSheets[2]).toBe(typedDocumentSheet)
      expect(documentSheets).toHaveLength(3)
      expect(documentSheets[1]).toBe(typedDocumentSheet)
      expect(documentSheets[2]).toStartWith('@layer segnavia.author{')
    }
  })

  test('orders typed and free css sheets and omits empty free css sheets', () => {
    const withFreeCss = compileStyleSheet({
      brand: sheet({ textStyles: { brand: { kind: 'character', color: '#111111' } }, css: '.brand{color:red}' }),
      document: sheet({ textStyles: { document: { kind: 'paragraph', color: '#222222' } }, css: '.author{color:blue}' }),
      baseCss: ':where(main){display:block}',
    })
    expect(withFreeCss.ok).toBe(true)
    if (!withFreeCss.ok) return
    expect(withFreeCss.sheets).toEqual([
      '@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;@layer segnavia.base{:where(main){display:block}}@layer segnavia.brand{.segnavia-style-brand{color:#111111}}',
      '@layer segnavia.brand{.brand{color:red}}',
      '@layer segnavia.document{.segnavia-style-document{color:#222222}}',
      '@layer segnavia.author{.author{color:blue}}',
    ])

    expect(compiled({}, {})).toEqual([
      '@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;@layer segnavia.base{}@layer segnavia.brand{}',
      '@layer segnavia.document{}',
    ])
    expect(compiled({ css: '' }, { css: '' })).toHaveLength(2)
  })

  test('returns merged geometries, motifs and font declarations', () => {
    const motif = { key: 'folio', revision: '1', label: 'Folio', fields: [], versions: [{ lang: 'en', html: '1' }] }
    const result = compileStyleSheet({
      brand: sheet({ motifs: [motif], fonts: { serif: { faces: [{}] } } }),
      document: sheet({
        pageGeometries: {
          main: { paper: 'a4', orientation: 'portrait', margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 } },
        },
        fonts: { held: { local: 'Held', fallback: 'serif' } },
      }),
    })
    expect(result).toMatchObject({
      ok: true,
      geometries: { main: { paper: 'a4' } },
      motifs: [{ key: 'folio' }],
      fonts: { serif: { faces: [{}] }, held: { local: 'Held', fallback: 'serif' } },
    })
  })
})
