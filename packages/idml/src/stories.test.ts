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
