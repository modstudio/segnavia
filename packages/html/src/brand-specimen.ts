import { Brand, type Brand as BrandValue, Document, type Document as DocumentValue } from '@segnavia/format'

export interface BrandSpecimenOptions {
  lang: 'en' | 'he'
}

const LATIN = 'Sphinx of black quartz, judge my vow.'
const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃'

function escaped(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function specimenHtml(brand: BrandValue): string {
  const colors = Object.keys(brand.tokens?.colors ?? {})
    .map(
      (name) =>
        `<figure><span class="swatch" style="background:var(--segnavia-color-${escaped(name)})"></span><figcaption>${escaped(name)}</figcaption></figure>`,
    )
    .join('')
  const families = Object.keys(brand.tokens?.fontFamilies ?? {})
    .map(
      (name) =>
        `<section style="font-family:var(--segnavia-family-${escaped(name)})"><h3>${escaped(name)}</h3><p dir="ltr">${LATIN}</p><p dir="rtl">${HEBREW}</p></section>`,
    )
    .join('')
  const styles = Object.keys(brand.textStyles ?? {})
    .map(
      (name) =>
        `<section><h3>${escaped(name)}</h3><p class="segnavia-style-${escaped(name)}" dir="ltr">${LATIN}</p><p class="segnavia-style-${escaped(name)}" dir="rtl">${HEBREW}</p></section>`,
    )
    .join('')
  return `<style>main{max-width:60rem;margin:auto;padding:2rem}h2{margin-block-start:2rem}.colors{display:flex;flex-wrap:wrap;gap:1rem}.swatch{display:block;width:6rem;height:4rem;border:1px solid currentColor}figure{margin:0}</style><main><h1>Brand specimen</h1><h2>Colors</h2><div class="colors">${colors}</div><h2>Font families</h2>${families}<h2>Text styles</h2>${styles}</main>`
}

export function brandSpecimen(input: BrandValue, options: BrandSpecimenOptions): DocumentValue {
  const brand = Brand.parse(input)
  return Document.parse({
    type: 'document',
    kind: 'book',
    title: 'Brand specimen',
    mode: 'continuous',
    settings: { scripts: 'refuse', dir: options.lang === 'he' ? 'rtl' : 'ltr', lang: options.lang },
    children: [{ type: 'flow', title: 'Brand specimen', html: specimenHtml(brand) }],
  })
}
