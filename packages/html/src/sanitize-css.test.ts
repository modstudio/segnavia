import { describe, expect, test } from 'bun:test'
import { lexicalFindings, sanitizeCss } from './sanitize-css.ts'

const rules = (source: string, dataFonts = false) => sanitizeCss(source, false, dataFonts)
const declarations = (source: string, dataFonts = false) => sanitizeCss(source, true, dataFonts)

describe('CSS sanitizer', () => {
  test('removes only fetching declarations and rules', () => {
    expect(rules('a{color:red;background:url(https://example.test/a.png)}b{color:blue}')).toEqual({ css: 'a{color:red;}b{color:blue}', removed: ['url()'] })
    expect(declarations('color:red;background:image-set("https://example.test/a.png" 1x);font-weight:bold')).toEqual({
      css: 'color:red;font-weight:bold',
      removed: ['image-set()'],
    })
    expect(rules('@import url(data:image/png;base64,AA==);p{color:red}')).toEqual({ css: 'p{color:red}', removed: ['@import'] })
  })

  test('keeps data images and gates data fonts to font-face and the option', () => {
    const image = 'p{background:url(data:image/png;base64,AA==)}'
    const font = '@font-face{font-family:x;src:url(data:font/woff2;base64,AA==)}'
    expect(rules(image)).toEqual({ css: image, removed: [] })
    expect(rules(font)).toEqual({ css: '', removed: ['data font'] })
    expect(rules(font, true)).toEqual({ css: font, removed: [] })
    expect(rules('p{src:url(data:font/woff2;base64,AA==)}', true)).toEqual({ css: 'p{}', removed: ['url()'] })
    expect(rules('p{background:url(data:image/avif;base64,AA==)}')).toEqual({ css: 'p{background:url(data:image/avif;base64,AA==)}', removed: [] })
    expect(rules('p{background:url(data:image/jpg;base64,AA==)}')).toEqual({ css: 'p{background:url(data:image/jpg;base64,AA==)}', removed: [] })
  })

  test('decodes fetching names and URL values', () => {
    expect(rules(String.raw`a{background:u\72l(https\3a //example.test/a.png);color:red}`)).toEqual({ css: 'a{color:red}', removed: ['url()'] })
    expect(rules(String.raw`@\69mport "https://example.test/a.css";p{color:red}`)).toEqual({ css: 'p{color:red}', removed: ['@import'] })
    expect(declarations(String.raw`background:s\72 c(https://example.test/a.png);color:red`)).toEqual({ css: 'color:red', removed: ['src()'] })
  })

  test('handles bad strings without hiding later fetches', () => {
    const sheet = 'p{content:"a\n} .q{background:url(http://probe.test/badstring.png)} .r{content:"}'
    const attribute = "content:'a\n;background:url(http://probe.test/badattr.png);x:'"
    expect(rules(sheet)).toEqual({ css: 'p{content:"a\n} .q{} .r{content:"}', removed: ['url()'] })
    expect(declarations(attribute)).toEqual({ css: "content:'a\n;x:'", removed: ['url()'] })
  })

  test('treats bad URLs as fetching and comments as token boundaries', () => {
    expect(rules('a{background:url(bad"value);color:red}')).toEqual({ css: 'a{color:red}', removed: ['url()'] })
    expect(rules('a{color:red;background:u/**/rl(https://example.test/a.png)}')).toEqual({ css: '', removed: ['url()'] })
    expect(rules('a{color:red}/* url(https://example.test/a.png)')).toEqual({ css: 'a{color:red}/* url(https://example.test/a.png)', removed: [] })
  })

  test('cleans nested media rules recursively', () => {
    const source = '@media (min-width:1px){a{color:red;background:url(https://example.test/a.png)}b{color:blue}}p{font-weight:bold}'
    expect(rules(source)).toEqual({ css: '@media (min-width:1px){a{color:red;}b{color:blue}}p{font-weight:bold}', removed: ['url()'] })
  })

  test('emits a parent close once after final nested units without semicolons', () => {
    for (const source of [
      '@font-feature-values X{@styleset{swash:1}}',
      '@page{@top-center{content:"Page"}}',
      '@media print{@page{@top-center{content:"Page"}}.sibling{color:red}}',
      '@media (min-width:1px){@media (max-width:9px){.x{color:red} junk}.y{color:blue}}',
    ]) {
      expect(rules(source)).toEqual({ css: source, removed: [] })
    }
  })

  test('keeps only image sets whose every item is an allowed data image', () => {
    const kept = 'p{background:image-set(url(data:image/png;base64,AA==) 1x)}'
    const removed = 'p{background:image-set("data:image/png;base64,AA==" 1x, "http://x/a.png" 2x)}'
    expect(rules(kept)).toEqual({ css: kept, removed: [] })
    expect(rules(removed)).toEqual({ css: 'p{}', removed: ['image-set()'] })
    expect(lexicalFindings(removed, false)).toEqual(['image-set()'])
  })

  test('the independent audit fails closed on every fetching spelling, including strings', () => {
    const cases = [
      ['p{content:"url(https://example.test/a.png)"}', 'url()'],
      ['p{content:"src(https://example.test/a.png)"}', 'src()'],
      ['p{content:"image-set(https://example.test/a.png)"}', 'image-set()'],
      ['p{content:"-webkit-image-set(https://example.test/a.png)"}', 'image-set()'],
      ['p{content:"@import https://example.test/a.css"}', '@import'],
      [String.raw`p{content:"u\72l(https://example.test/a.png)"}`, 'url()'],
      ['p{content:"u/**/rl(https://example.test/a.png)"}', 'url()'],
    ] as const
    for (const [source, finding] of cases) expect(rules(source)).toEqual({ css: '', removed: [finding] })
  })

  test('the independent audit permits allowed data URLs', () => {
    expect(rules('p{content:"url(data:image/png;base64,AA==)"}')).toEqual({ css: 'p{content:"url(data:image/png;base64,AA==)"}', removed: [] })
    expect(rules('p{content:"src(data:font/woff2;base64,AA==)"}', true)).toEqual({ css: 'p{content:"src(data:font/woff2;base64,AA==)"}', removed: [] })
  })
})
