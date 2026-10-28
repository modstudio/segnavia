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
