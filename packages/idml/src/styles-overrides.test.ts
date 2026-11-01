import { expect, test } from 'bun:test'
import { sanitizeBookCss } from '@segnavia/html'
import { ReportCollector } from './report.ts'
import { StyleMapper } from './styles.ts'
import type { IdmlStyle } from './types.ts'

const style = (id: string, name: string, properties: Record<string, string>, basedOn?: string, kind: IdmlStyle['kind'] = 'paragraph'): IdmlStyle => ({
  id,
  name,
  kind,
  properties,
  ...(basedOn ? { basedOn } : {}),
  location: `Styles#${id}`,
})

test('composes shaded paragraph box values in local overrides', () => {
  const report = new ReportCollector()
  const base = {
    SpaceBefore: '4.3',
    SpaceAfter: '3',
    LeftIndent: '14',
    RightIndent: '20',
    ParagraphShadingOn: 'true',
    ParagraphShadingColor: 'Color/Black',
    ParagraphShadingTint: '100',
    ParagraphShadingTopOffset: '0.1',
    ParagraphShadingBottomOffset: '0.5',
    ParagraphShadingLeftOffset: '0.2',
    ParagraphShadingRightOffset: '0.3',
  }
  const mapper = new StyleMapper([], [], report, 'ltr')
  const offset = mapper.overrideClass({ ParagraphShadingLeftOffset: '0.4' }, base, 'ltr', 'offset')
  const spacing = mapper.overrideClass({ SpaceBefore: '6' }, base, 'ltr', 'spacing')
  const clipped = mapper.overrideClass({ ParagraphShadingClipToFrame: 'true' }, base, 'ltr', 'clipped')
  const css = mapper.css()
  expect(css).toContain(`.${offset}{margin-block-start:4.2pt`)
  expect(css).toContain('padding-inline-start:14.4pt;padding-inline-end:20.3pt')
  expect(css).toContain(`.${spacing}{margin-block-start:5.9pt`)
  expect(css).toContain('padding-inline-start:14.2pt;padding-inline-end:20.3pt')
  expect(clipped).toBeDefined()
  expect(report.data().unsupportedOverrideProperties).toEqual({ ParagraphShadingClipToFrame: 1 })
})

test('turns paragraph shading on and off in local overrides', () => {
  const mapper = new StyleMapper([], [], new ReportCollector(), 'ltr')
  const on = mapper.overrideClass(
    { ParagraphShadingOn: 'true', ParagraphShadingColor: 'Color/Black', ParagraphShadingTint: '100' },
    { SpaceBefore: '2', LeftIndent: '5' },
    'ltr',
    'on',
  )
  const off = mapper.overrideClass(
    { ParagraphShadingOn: 'false' },
    {
      SpaceBefore: '4',
      SpaceAfter: '3',
      LeftIndent: '10',
      RightIndent: '20',
      ParagraphShadingOn: 'true',
      ParagraphShadingColor: 'Color/Black',
      ParagraphShadingTopOffset: '0.5',
      ParagraphShadingLeftOffset: '0.8',
    },
    'ltr',
    'off',
  )
  const css = mapper.css()
  expect(css).toContain(`.${on}{margin-block-start:2pt;padding-inline-start:5pt;background-color:#000}`)
  expect(css).toContain(`.${off}{margin-block-start:4pt;margin-block-end:3pt;padding-block-start:0pt;padding-block-end:0pt`)
  expect(css).toContain('padding-inline-start:10pt;padding-inline-end:20pt;margin-inline-start:0pt;margin-inline-end:0pt;background-color:transparent')
  expect(css).toContain('border-start-start-radius:0pt;border-start-end-radius:0pt;border-end-start-radius:0pt;border-end-end-radius:0pt')
})

test('maps keeps and deduplicates equal local override property sets', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [style('kept', 'Kept', { KeepWithNext: '1', KeepLinesTogether: 'true', KeepAllLinesTogether: 'true', StartParagraph: 'NextPage' })],
    [],
    report,
    'ltr',
  )
  mapper.styleClass('kept', 'paragraph')
  const first = mapper.overrideClass({ PointSize: '14' }, {}, 'ltr', 'one')
  const second = mapper.overrideClass({ PointSize: '14' }, {}, 'ltr', 'two')
  expect(first).toBe(second)
  const css = mapper.css()
  expect(css).toContain('break-after:avoid;break-inside:avoid')
  expect(css).not.toContain('break-before')
  expect(report.data().unsupportedStyleProperties).toMatchObject({ 'StartParagraph:NextPage': 1 })
  expect(css.match(/\.idml-o-1/g)).toHaveLength(1)
  expect(sanitizeBookCss(css).removed).toEqual([])
})

test('allocates typed and raw override classes from one sequence', () => {
  const mapper = new StyleMapper([], [], new ReportCollector(), 'ltr')
  expect(mapper.overrideClass({ PointSize: '14' }, {}, 'ltr', 'one')).toBe('idml-o-1')
  expect(mapper.cssOverrideClass('padding-block-start:2pt')).toBe('idml-o-2')
  expect(mapper.overrideClass({ PointSize: '16' }, {}, 'ltr', 'two')).toBe('idml-o-3')
  expect(mapper.cssOverrideClass('padding-block-start:2pt')).toBe('idml-o-2')
})

test('corrects physical indents and alignment when paragraph direction overrides its style', () => {
  const mapper = new StyleMapper(
    [style('rtl', 'RTL', { ParagraphDirection: 'RightToLeftDirection', RightIndent: '52', Justification: 'RightAlign' })],
    [],
    new ReportCollector(),
    'rtl',
  )
  const base = mapper.flattened('rtl', 'paragraph')
  mapper.styleClass('rtl', 'paragraph')
  const override = mapper.overrideClass(
    { AppliedParagraphStyle: 'rtl', ParagraphDirection: 'LeftToRightDirection' },
    base,
    'ltr',
    'Story#paragraph',
    mapper.paragraphStyleDirection(base),
  )
  expect(override).toBe('idml-o-1')
  const css = mapper.css()
  expect(css).toContain('.idml-p-rtl{padding-inline-start:52pt;text-align:start}')
  expect(css).toContain('.idml-o-1{padding-inline-start:0pt;padding-inline-end:52pt;text-align:end}')
  expect(['idml-p-rtl', override]).toEqual(['idml-p-rtl', 'idml-o-1'])
})

test('records the resolved family when only a font style is overridden', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper([], [], report, 'ltr')
  mapper.overrideClass({ FontStyle: 'Bold' }, { AppliedFont: 'Book Face', FontStyle: 'Regular' }, 'ltr', 'Story#run')
  expect(report.data().fonts).toMatchObject([{ appliedFont: 'Book Face', fontStyle: 'Bold' }])
})
