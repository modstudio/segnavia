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

test('flattens based-on chains through the root and stops at cycles', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [
      style('root', '$ID/[No paragraph style]', { ParagraphDirection: 'RightToLeftDirection', AppliedLanguage: '$ID/Hebrew', PointSize: '10' }),
      style('a', 'A', { SpaceAfter: '4' }, 'b'),
      style('b', 'B', { PointSize: '12' }, 'a'),
    ],
    [],
    report,
    'rtl',
  )
  expect(mapper.flattened('a', 'paragraph')).toMatchObject({
    ParagraphDirection: 'RightToLeftDirection',
    AppliedLanguage: '$ID/Hebrew',
    PointSize: '12',
    SpaceAfter: '4',
  })
  expect(mapper.rootLanguage()).toBe('he')
})

test('maps physical alignment and hanging indents to logical sides', () => {
  const mapper = new StyleMapper(
    [
      style('rtl', 'RTL', { ParagraphDirection: 'RightToLeftDirection', Justification: 'RightAlign', RightIndent: '52', FirstLineIndent: '-52' }),
      style('ltr', 'LTR', { ParagraphDirection: 'LeftToRightDirection', Justification: 'LeftAlign', LeftIndent: '20', FirstLineIndent: '-5' }),
    ],
    [],
    new ReportCollector(),
    'rtl',
  )
  mapper.styleClass('rtl', 'paragraph')
  mapper.styleClass('ltr', 'paragraph')
  expect(mapper.css()).toContain('.idml-p-rtl{text-indent:-52pt;padding-inline-start:52pt;text-align:start}')
  expect(mapper.css()).toContain('.idml-p-ltr{text-indent:-5pt;padding-inline-start:20pt;text-align:start}')
})

test('maps RTL paragraph shading with tint, offsets, and rounded corners', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [
      style('shade', 'Shade', {
        ParagraphDirection: 'RightToLeftDirection',
        SpaceBefore: '4',
        SpaceAfter: '3',
        RightIndent: '10',
        LeftIndent: '20',
        ParagraphShadingOn: 'true',
        ParagraphShadingColor: 'gray',
        ParagraphShadingTint: '10',
        ParagraphShadingTopOffset: '0.5',
        ParagraphShadingBottomOffset: '0.5',
        ParagraphShadingLeftOffset: '0.8',
        ParagraphShadingRightOffset: '0.3',
        ParagraphShadingTopLeftCornerOption: 'RoundedCorner',
        ParagraphShadingTopLeftCornerRadius: '2',
        ParagraphShadingTopRightCornerOption: 'RoundedCorner',
        ParagraphShadingTopRightCornerRadius: '2',
        ParagraphShadingBottomLeftCornerOption: 'RoundedCorner',
        ParagraphShadingBottomLeftCornerRadius: '2',
        ParagraphShadingBottomRightCornerOption: 'RoundedCorner',
        ParagraphShadingBottomRightCornerRadius: '2',
        ParagraphShadingWidth: 'ColumnWidth',
        ParagraphShadingTopOrigin: 'AscentTopOrigin',
        ParagraphShadingBottomOrigin: 'DescentBottomOrigin',
        ParagraphShadingClipToFrame: 'false',
        ParagraphShadingSuppressPrinting: 'false',
      }),
    ],
    [{ id: 'gray', name: 'Gray', model: 'rgb', values: [100, 110, 120] }],
    report,
    'rtl',
  )
  mapper.styleClass('shade', 'paragraph')
  const css = mapper.css()
  expect(css).toContain('margin-block-start:3.5pt;margin-block-end:2.5pt;padding-block-start:0.5pt;padding-block-end:0.5pt')
  expect(css).toContain('padding-inline-start:10.3pt;padding-inline-end:20.8pt;margin-inline-start:-0.3pt;margin-inline-end:-0.8pt')
  expect(css).toContain('background-color:color-mix(in srgb, rgb(100 110 120) 10%, #fff)')
  expect(css).toContain('border-start-start-radius:2pt;border-start-end-radius:2pt;border-end-start-radius:2pt;border-end-end-radius:2pt')
  expect(sanitizeBookCss(css).removed).toEqual([])
  expect(report.data().unsupportedStyleProperties).toEqual({})
})

test('uses the plain shading color for full and unspecified tint', () => {
  const mapper = new StyleMapper(
    [
      style('full', 'Full', { ParagraphShadingOn: 'true', ParagraphShadingColor: 'Color/Black', ParagraphShadingTint: '100' }),
      style('none', 'None', { ParagraphShadingOn: 'true', ParagraphShadingColor: 'Color/Black', ParagraphShadingTint: '-1' }),
    ],
    [],
    new ReportCollector(),
    'ltr',
  )
  mapper.styleClass('full', 'paragraph')
  mapper.styleClass('none', 'paragraph')
  expect(mapper.css().match(/background-color:#000/g)).toHaveLength(2)
})

test('reports unresolved shading colors and unsupported text-width shading', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [style('missing', 'Missing', { ParagraphShadingOn: 'true', ParagraphShadingColor: 'Color/Missing', ParagraphShadingWidth: 'TextWidth' })],
    [],
    report,
    'ltr',
  )
  mapper.styleClass('missing', 'paragraph')
  expect(mapper.css()).not.toContain('background-color')
  expect(report.data().unsupportedStyleProperties).toEqual({ 'ParagraphShadingColor:Color/Missing': 1, ParagraphShadingWidth: 1 })
})

test('reports shading options that do not have CSS equivalents', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [
      style('options', 'Options', {
        ParagraphShadingOn: 'true',
        ParagraphShadingColor: 'Color/Black',
        ParagraphShadingTopLeftCornerOption: 'BevelCorner',
        ParagraphShadingTopOrigin: 'LeadingTopOrigin',
        ParagraphShadingBottomOrigin: 'BaselineBottomOrigin',
        ParagraphShadingClipToFrame: 'true',
        ParagraphShadingSuppressPrinting: 'true',
      }),
    ],
    [],
    report,
    'ltr',
  )
  mapper.styleClass('options', 'paragraph')
  mapper.css()
  expect(report.data().unsupportedStyleProperties).toEqual({
    ParagraphShadingBottomOrigin: 1,
    ParagraphShadingClipToFrame: 1,
    ParagraphShadingSuppressPrinting: 1,
    ParagraphShadingTopLeftCornerOption: 1,
    ParagraphShadingTopOrigin: 1,
  })
})

test('maps paragraph spacing and indents without shading', () => {
  const mapper = new StyleMapper(
    [style('plain', 'Plain', { ParagraphDirection: 'RightToLeftDirection', SpaceBefore: '4', SpaceAfter: '3', RightIndent: '10', LeftIndent: '20' })],
    [],
    new ReportCollector(),
    'rtl',
  )
  mapper.styleClass('plain', 'paragraph')
  const css = mapper.css()
  expect(css).toContain('margin-block-start:4pt;margin-block-end:3pt;padding-inline-start:10pt;padding-inline-end:20pt')
  expect(css).not.toContain('background-color')
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

test('reports absent shading colors and clamps invalid composite padding', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [
      style('missing-color', 'Missing color', { ParagraphShadingOn: 'true' }),
      style('negative', 'Negative', {
        ParagraphShadingOn: 'true',
        ParagraphShadingColor: 'Color/Black',
        LeftIndent: '1',
        ParagraphShadingLeftOffset: '-2',
      }),
    ],
    [],
    report,
    'ltr',
  )
  mapper.styleClass('missing-color', 'paragraph')
  mapper.styleClass('negative', 'paragraph')
  const css = mapper.css()
  expect(css).toContain('.idml-p-negative{padding-inline-start:0pt;margin-inline-start:2pt;background-color:#000}')
  expect(report.data().unsupportedStyleProperties).toEqual({ ParagraphShadingColor: 1, ParagraphShadingLeftOffset: 1 })
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

test('maps partial line keeps to orphans and widows', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [
      style('partial', 'Partial', {
        KeepLinesTogether: 'true',
        KeepAllLinesTogether: 'false',
        KeepFirstLines: '3',
        KeepLastLines: '4',
        StartParagraph: 'NextColumn',
      }),
    ],
    [],
    report,
    'ltr',
  )
  mapper.styleClass('partial', 'paragraph')
  const css = mapper.css()
  expect(css).toContain('orphans:3;widows:4')
  expect(css).not.toContain('break-before')
  expect(report.data().unsupportedStyleProperties).toMatchObject({ 'StartParagraph:NextColumn': 1 })
})

test('reports only active root gaps, non-root formatting gaps, and no style metadata', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [
      style('root', '$ID/[No paragraph style]', {
        RubyFlag: 'false',
        KentenAlignment: 'None',
        WarichuLines: '0',
        RuleAbove: 'false',
        EmitCss: 'true',
        StyleUniqueId: 'metadata',
      }),
      style(
        'section',
        'Section',
        {
          RuleAbove: 'true',
          RuleBelow: 'true',
          ParagraphBorderOn: 'true',
          Composer: 'HL Composer Optyca',
          DropCapLines: '2',
          TabList: '48',
          FillTint: '80',
          BaselineShift: '1',
          KeyboardShortcut: '0 0',
          NextStyle: 'section',
        },
        'root',
      ),
    ],
    [],
    report,
    'rtl',
  )
  mapper.styleClass('section', 'paragraph')
  mapper.css()
  expect(report.data().unsupportedStyleProperties).toEqual({
    BaselineShift: 1,
    Composer: 1,
    DropCapLines: 1,
    FillTint: 1,
    ParagraphBorderOn: 1,
    RuleAbove: 1,
    RuleBelow: 1,
    TabList: 1,
  })
})

test('reports binding-side alignment without emitting a static side', () => {
  const report = new ReportCollector()
  const mapper = new StyleMapper(
    [style('toward', 'Toward', { Justification: 'ToBindingSide' }), style('away', 'Away', { Justification: 'AwayFromBindingSide' })],
    [],
    report,
    'rtl',
  )
  mapper.styleClass('toward', 'paragraph')
  mapper.styleClass('away', 'paragraph')
  const css = mapper.css()
  expect(css).not.toContain('text-align')
  expect(report.data().unsupportedStyleProperties).toEqual({
    'Justification:AwayFromBindingSide': 1,
    'Justification:ToBindingSide': 1,
  })
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
