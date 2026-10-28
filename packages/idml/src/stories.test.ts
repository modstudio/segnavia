import { expect, test } from 'bun:test'
import { findActiveContent, sanitize } from '@segnavia/html'
import { ReportCollector } from './report.ts'
import { storyHtml } from './stories.ts'
import { StyleMapper } from './styles.ts'
import type { IdmlStyle, IdmlTextNode } from './types.ts'

const node = (name: string, children: IdmlTextNode[] = [], attributes: Record<string, string> = {}, text?: string): IdmlTextNode => ({
  name,
  attributes,
  children,
  ...(text === undefined ? {} : { text }),
  location: `Story/${name}`,
})

const paragraphStyle: IdmlStyle = {
  id: 'p',
  name: 'Body',
  kind: 'paragraph',
  properties: { ParagraphDirection: 'RightToLeftDirection', AppliedLanguage: '$ID/Hebrew', SpanColumnType: 'SingleColumn' },
  location: 'Styles#p',
}

test('splits paragraphs at nested Br nodes, preserves line separators, and escapes content', () => {
  const report = new ReportCollector()
  const styles = new StyleMapper([paragraphStyle], [], report, 'rtl')
  const root = node('Story', [
    node(
      'ParagraphStyleRange',
      [node('CharacterStyleRange', [node('Content', [], {}, '<script>one\u2028line'), node('Br'), node('Content', [], {}, 'two')]), node('Br')],
      { AppliedParagraphStyle: 'p' },
    ),
  ])
  const result = storyHtml({ id: 'story', root, frame: { columns: 2, gutter: 12 } }, styles, report, 'rtl', 'he')
  expect(result.html).toBe('<p class="idml-p-body" data-columns="2">&lt;script&gt;one<br>line</p><p class="idml-p-body" data-columns="2">two</p>')
  expect(findActiveContent(result.html)).toEqual([])
  expect(sanitize(result.html)).toBe(result.html)
})

test('emits columns, language and direction only where they differ and counts omitted content', () => {
  const report = new ReportCollector()
  const styles = new StyleMapper(
    [
      paragraphStyle,
      {
        ...paragraphStyle,
        id: 'en',
        name: 'English',
        properties: { ParagraphDirection: 'LeftToRightDirection', AppliedLanguage: '$ID/English: USA', SpanColumnType: 'SpanColumns' },
      },
    ],
    [],
    report,
    'rtl',
  )
  const root = node('Story', [
    node('ParagraphStyleRange', [node('Content', [], {}, 'עברית')], { AppliedParagraphStyle: 'p' }),
    node('ParagraphStyleRange', [node('Content', [], {}, 'English'), node('Table')], { AppliedParagraphStyle: 'en' }),
  ])
  const result = storyHtml({ id: 'story', root, frame: { columns: 2, gutter: 10 } }, styles, report, 'rtl', 'he')
  expect(result.html).toContain('<p class="idml-p-body" data-columns="2">עברית</p>')
  expect(result.html).toContain('<p class="idml-p-english" dir="ltr" lang="en-US">English</p>')
  expect(report.data().unsupportedElements).toEqual({ Table: 1 })
})

test('deduplicates override classes across paragraphs and counts unmapped properties', () => {
  const report = new ReportCollector()
  const styles = new StyleMapper([paragraphStyle], [], report, 'rtl')
  const root = node('Story', [
    node('ParagraphStyleRange', [node('Content', [], {}, 'א')], { AppliedParagraphStyle: 'p', PointSize: '14', RuleAbove: 'true' }),
    node('ParagraphStyleRange', [node('Content', [], {}, 'ב')], { AppliedParagraphStyle: 'p', PointSize: '14', RuleAbove: 'true' }),
  ])
  const result = storyHtml({ id: 'story', root }, styles, report, 'rtl', 'he')
  expect(result.html.match(/idml-o-1/g)).toHaveLength(2)
  expect(report.data().unsupportedOverrideProperties).toEqual({ RuleAbove: 2 })
})

test('maps a character style and a local character override onto one span', () => {
  const report = new ReportCollector()
  const characterStyle: IdmlStyle = {
    id: 'strong',
    name: 'Strong',
    kind: 'character',
    properties: { PointSize: '11', Tracking: '50' },
    location: 'Styles#strong',
  }
  const styles = new StyleMapper([paragraphStyle, characterStyle], [], report, 'rtl')
  const root = node('Story', [
    node('ParagraphStyleRange', [node('CharacterStyleRange', [node('Content', [], {}, 'מודגש')], { AppliedCharacterStyle: 'strong', PointSize: '13' })], {
      AppliedParagraphStyle: 'p',
    }),
  ])
  const result = storyHtml({ id: 'story', root }, styles, report, 'rtl', 'he')
  expect(result.html).toContain('<span class="idml-c-strong idml-o-1">מודגש</span>')
  expect(styles.css()).toContain('.idml-c-strong{font-size:11pt;letter-spacing:0.05em}')
  expect(styles.css()).toContain('.idml-o-1{font-size:13pt}')
})

test('uses story direction before content and content direction when the story has none', () => {
  const plainStyle: IdmlStyle = { ...paragraphStyle, id: 'plain', name: 'Plain', properties: {} }
  const root = node('Story', [node('ParagraphStyleRange', [node('Content', [], {}, 'עברית')], { AppliedParagraphStyle: 'plain' })])

  const storyStyles = new StyleMapper([plainStyle], [], new ReportCollector(), 'rtl')
  expect(storyHtml({ id: 'story', root, direction: 'ltr' }, storyStyles, new ReportCollector(), 'rtl', undefined).html).toContain('dir="ltr"')

  const contentStyles = new StyleMapper([plainStyle], [], new ReportCollector(), 'rtl')
  expect(storyHtml({ id: 'story', root }, contentStyles, new ReportCollector(), 'rtl', undefined).html).not.toContain('dir=')
})

test('omits and reports column counts outside the Book HTML range once per frame', () => {
  const report = new ReportCollector()
  const styles = new StyleMapper([paragraphStyle], [], report, 'rtl')
  const root = node('Story', [
    node('ParagraphStyleRange', [node('Content', [], {}, 'א')], { AppliedParagraphStyle: 'p' }),
    node('ParagraphStyleRange', [node('Content', [], {}, 'ב')], { AppliedParagraphStyle: 'p' }),
  ])
  const result = storyHtml({ id: 'story', root, frame: { columns: 5, gutter: 10, location: 'Spread#frame' } }, styles, report, 'rtl', 'he')
  expect(result.html).not.toContain('data-columns')
  expect(report.data().unsupportedElements).toEqual({ 'TextColumnCount:5': 1 })
  expect(report.data().locations['element:TextColumnCount:5']).toEqual(['Spread#frame'])
})
