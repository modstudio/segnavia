import { describe, expect, test } from 'bun:test'
import { StyleSheet } from '@segnavia/format'
import { compileStyleSheet } from './style-compile.ts'

const sheet = (value: unknown) => StyleSheet.parse(value)

function compiled(brand: unknown, document: unknown): string {
  const result = compileStyleSheet({ brand: sheet(brand), document: sheet(document), dir: 'ltr' })
  expect(result.ok).toBe(true)
  return result.ok ? result.css : ''
}

describe('compileStyleSheet', () => {
  test('orders layers, emits origin tokens and flattens styles with logical properties', () => {
    const css = compiled(
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
    expect(css.startsWith('@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;')).toBe(true)
    expect(css).toContain(':root{--segnavia-color-ink:#123456;--segnavia-size-leading:14pt;--segnavia-family-body:"Noto Serif",serif}')
    expect(css).toContain('.segnavia-style-base{font-family:var(--segnavia-family-body);color:var(--segnavia-color-ink);margin-block-start:3mm}')
    expect(css).toContain(
      '@layer segnavia.document{:root{--segnavia-size-body:11pt}.segnavia-style-body{font-family:var(--segnavia-family-body);font-size:var(--segnavia-size-body);color:var(--segnavia-color-ink);text-align:start;margin-block-start:3mm}}',
    )
  })

  test('does not leak a replaced brand property into the compiled document class', () => {
    const css = compiled(
      { textStyles: { body: { kind: 'paragraph', color: '#111111', fontStyle: 'italic' } } },
      { textStyles: { body: { kind: 'paragraph', fontWeight: 700 } } },
    )
    expect(css).toContain('@layer segnavia.document{.segnavia-style-body{font-weight:700}}')
    expect(css).not.toContain('color:#111111')
    expect(css).not.toContain('font-style:italic')
  })

  test('sanitizes free css before keeping author layers nested and escapes style termination', () => {
    const css = compiled(
      { css: '@import "https://example.test/brand.css";.brand{background:url(https://example.test/a.png);color:red}' },
      { css: '@layer x{.x{color:blue}}.end{content:"</style><script>bad</script>"}' },
    )
    expect(css).toContain('@layer segnavia.brand{.brand{color:red}}')
    expect(css).toContain('@layer segnavia.author{@layer x{.x{color:blue}}')
    expect(css).toContain('content:"\\3c /style>\\3c script>bad\\3c /script>"')
    expect(css).not.toContain('@import')
    expect(css).not.toContain('url(')
    expect(css).not.toContain('</style>')
  })

  test('keeps unmatched closing braces in document and brand css inside their layers', () => {
    const freeCss = 'a{color:blue} } body{color:red}'
    const documentCss = compiled({}, { css: freeCss })
    const brandCss = compiled({ css: freeCss }, {})

    expect(documentCss).toBe(
      '@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;@layer segnavia.base{}@layer segnavia.brand{}@layer segnavia.document{}@layer segnavia.author{a{color:blue}  body{color:red}}',
    )
    expect(brandCss).toBe(
      '@layer segnavia.base, segnavia.brand, segnavia.document, segnavia.author;@layer segnavia.base{}@layer segnavia.brand{a{color:blue}  body{color:red}}@layer segnavia.document{}@layer segnavia.author{}',
    )
    expect(documentCss.match(/@layer segnavia\.(?:base|brand|document|author)\{/g)).toHaveLength(4)
    expect(brandCss.match(/@layer segnavia\.(?:base|brand|document|author)\{/g)).toHaveLength(4)
  })

  test('closes an unfinished free css block inside its layer', () => {
    const css = compiled({}, { css: 'a{color:blue' })

    expect(css).toContain('@layer segnavia.author{a{color:blue}}')
  })

  test('keeps a closing brace inside a free css string while dropping an unmatched brace', () => {
    const css = compiled({}, { css: 'a::after{content:"}"} } body{color:red}' })

    expect(css).toContain('@layer segnavia.author{a::after{content:"}"}  body{color:red}}')
  })

  test('escapes newlines in quoted font family names', () => {
    const css = compiled({}, { tokens: { fontFamilies: { x: ['A B\n}} body{color:red}'] } } })

    expect(css).toContain('--segnavia-family-x:"A B\\a }} body{color:red}"')
    expect(css).not.toContain('\n')
  })

  test('returns merged geometries, motifs and font references', () => {
    const motif = { key: 'folio', revision: '1', label: 'Folio', fields: [], versions: [{ lang: 'en', html: '1' }] }
    const result = compileStyleSheet({
      brand: sheet({ motifs: [motif], fonts: [{ app: 'serif' }] }),
      document: sheet({
        pageGeometries: {
          main: { paper: 'a4', orientation: 'portrait', margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 } },
        },
        fonts: [{ local: 'Held', fallback: 'serif' }],
      }),
      dir: 'rtl',
    })
    expect(result).toMatchObject({
      ok: true,
      geometries: { main: { paper: 'a4' } },
      motifs: [{ key: 'folio' }],
      fonts: [{ app: 'serif' }, { local: 'Held', fallback: 'serif' }],
    })
  })
})
