import { expect, test } from 'bun:test'
import { joinLeadingHeading, normalizeMarkdownTitle, splitLeadingHeading } from './markdown-title.ts'

test.each(['# Title\n\nBody', '\n\n# כותרת עברית\n\nגוף', 'Body without a heading', '```js\nconst value = "# not a heading"\n```'])(
  'leading-heading split and join round trips %p',
  (markdown) => {
    const split = splitLeadingHeading(markdown)
    expect(joinLeadingHeading(split.editable, split.retained)).toBe(markdown)
  },
)

test('a Hebrew leading heading is the title and is absent from the editable body', () => {
  expect(splitLeadingHeading('# שלום עולם\n\nEnglish body.')).toEqual({ title: 'שלום עולם', editable: '\n\nEnglish body.', retained: '# שלום עולם' })
})

test('a hash inside code is not a leading heading', () => {
  const markdown = '```text\n# code\n```'
  expect(splitLeadingHeading(markdown)).toEqual({ title: null, editable: markdown, retained: '' })
})

test('title newlines collapse to single spaces', () => {
  expect(normalizeMarkdownTitle('One\r\nTwo\n\nThree')).toBe('One Two Three')
})
