import { expect, test } from 'bun:test'
import { compositionStyleDeclarations, resolvedCompositionProperties } from './composition-style.ts'
import { ReportCollector } from './report.ts'

function compile(values: Record<string, string>): { declarations: string[]; unsupported: Record<string, number> } {
  const report = new ReportCollector()
  const declarations = compositionStyleDeclarations({
    values,
    mapped: new Set(Object.keys(values)),
    report,
    unsupported: report.unsupportedStyleProperties,
    location: 'Styles.xml',
  })
  return { declarations, unsupported: report.data().unsupportedStyleProperties }
}

test('emits known composition values and reports every value it cannot carry', () => {
  expect(
    compile({
      Composer: '$ID/Adobe World-Ready Paragraph Composer',
      MinimumWordSpacing: '80',
      DesiredWordSpacing: '90',
      MaximumWordSpacing: '133',
      Hyphenation: 'false',
    }),
  ).toEqual({
    declarations: ['--segnavia-composer:paragraph', '--segnavia-word-spacing:80% 90% 133%', '--segnavia-hyphenate:false'],
    unsupported: {},
  })

  expect(
    compile({
      Composer: 'unknown composer',
      MinimumWordSpacing: '120',
      DesiredWordSpacing: '90',
      MaximumWordSpacing: '100',
      Hyphenation: 'sometimes',
    }),
  ).toEqual({
    declarations: [],
    unsupported: { Composer: 1, MinimumWordSpacing: 1, DesiredWordSpacing: 1, MaximumWordSpacing: 1, Hyphenation: 1 },
  })
})

test('completes a changed word-spacing member from effective values and InDesign defaults', () => {
  const values = { DesiredWordSpacing: '90', ...resolvedCompositionProperties({ DesiredWordSpacing: '90' }, {}) }
  expect(compile(values)).toEqual({ declarations: ['--segnavia-word-spacing:80% 90% 133%'], unsupported: {} })
})
