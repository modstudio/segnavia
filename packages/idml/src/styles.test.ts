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
  const mapper = new StyleMapper(
    [style('kept', 'Kept', { KeepWithNext: '1', KeepLinesTogether: 'true', KeepAllLinesTogether: 'true', StartParagraph: 'NextPage' })],
    [],
    new ReportCollector(),
    'ltr',
  )
  mapper.styleClass('kept', 'paragraph')
  const first = mapper.overrideClass({ PointSize: '14' }, {}, 'ltr', 'one')
  const second = mapper.overrideClass({ PointSize: '14' }, {}, 'ltr', 'two')
  expect(first).toBe(second)
  expect(mapper.css()).toContain('break-after:avoid;break-inside:avoid;break-before:page')
  expect(mapper.css().match(/\.idml-o-1/g)).toHaveLength(1)
  expect(sanitizeBookCss(mapper.css()).removed).toEqual([])
})

test('maps partial line keeps to orphans and widows', () => {
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
    new ReportCollector(),
    'ltr',
  )
  mapper.styleClass('partial', 'paragraph')
  expect(mapper.css()).toContain('orphans:3;widows:4;break-before:column')
})
