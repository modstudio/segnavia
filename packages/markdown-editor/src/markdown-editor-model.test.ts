import { describe, expect, test } from 'bun:test'
import {
  markdownEditorModel,
  normalizeMarkdownLineEndings,
  setModelEditable,
  setModelMarkdown,
  setModelTitle,
  setModelTitleSource,
} from './markdown-editor-model.ts'

describe('markdown line endings', () => {
  test.each([
    ['CRLF', 'First\r\nSecond', 'First\nSecond'],
    ['lone CR', 'First\rSecond', 'First\nSecond'],
    ['mixed endings', 'First\r\nSecond\rThird\nFourth', 'First\nSecond\nThird\nFourth'],
    ['adjacent CR and CRLF', 'First\r\r\nSecond', 'First\n\nSecond'],
    ['no CR', 'First\nSecond', 'First\nSecond'],
  ])('normalizes %s', (_name, markdown, expected) => {
    expect(normalizeMarkdownLineEndings(markdown)).toBe(expected)
  })

  test('normalizes a host body before deriving its leading-heading title', () => {
    const leading = setModelTitleSource(markdownEditorModel(), 'leading-heading')
    const model = setModelMarkdown(leading, '# Host title\r\n\r\nBody line\r\n')
    expect(model).toMatchObject({ title: 'Host title', markdown: '# Host title\n\nBody line\n', editable: '\nBody line\n' })
  })
})

describe('separate title source', () => {
  test('keeps the host title independent of markdown', () => {
    const titled = setModelTitle(markdownEditorModel(), 'A title')
    const body = setModelMarkdown(titled, '# Body heading\n\nBody')
    expect(body).toMatchObject({ title: 'A title', markdown: '# Body heading\n\nBody', editable: '# Body heading\n\nBody' })
  })

  test('null and undefined both hide the title', () => {
    const titled = setModelTitle(markdownEditorModel(), 'A title')
    expect(setModelTitle(titled, null).title).toBeNull()
    expect(setModelTitle(titled, undefined).title).toBeNull()
  })
})

describe('leading-heading title source', () => {
  test('the body heading becomes the visible title and leaves the editable body', () => {
    const body = setModelMarkdown(markdownEditorModel(), '# שלום\n\nBody')
    expect(setModelTitleSource(body, 'leading-heading')).toMatchObject({ title: 'שלום', editable: '\nBody', retained: '# שלום\n' })
  })

  test('a body without a heading has a visible empty title', () => {
    expect(setModelTitleSource(setModelMarkdown(markdownEditorModel(), 'Body'), 'leading-heading')).toMatchObject({ title: '', editable: 'Body' })
  })

  test('null and undefined cannot remove the body heading', () => {
    const leading = setModelTitleSource(setModelMarkdown(markdownEditorModel(), '# Title\n\nBody'), 'leading-heading')
    expect(setModelTitle(leading, null)).toBe(leading)
    expect(setModelTitle(leading, undefined)).toBe(leading)
  })

  test('an empty title removes the heading line', () => {
    const leading = setModelTitleSource(setModelMarkdown(markdownEditorModel(), '# Title\n\nBody'), 'leading-heading')
    expect(setModelTitle(leading, '')).toMatchObject({ title: '', markdown: '\nBody', retained: '' })
  })

  test('a title added to a body is separated by one blank line', () => {
    const leading = setModelTitleSource(setModelMarkdown(markdownEditorModel(), 'Body'), 'leading-heading')
    expect(setModelTitle(leading, 'New title').markdown).toBe('# New title\n\nBody')
  })

  test('a title added to an empty body has no trailing blank lines', () => {
    const leading = setModelTitleSource(markdownEditorModel(), 'leading-heading')
    expect(setModelTitle(leading, 'New title').markdown).toBe('# New title')
  })

  test('source edits keep a newly typed heading in the editable body', () => {
    const leading = setModelTitleSource(setModelMarkdown(markdownEditorModel(), 'Body'), 'leading-heading')
    expect(setModelEditable(leading, '# Typed in source\n\nBody')).toMatchObject({
      title: '',
      markdown: '# Typed in source\n\nBody',
      editable: '# Typed in source\n\nBody',
    })
  })

  test('setting markdown is the operation that splits a newly supplied heading', () => {
    const leading = setModelTitleSource(markdownEditorModel(), 'leading-heading')
    expect(setModelMarkdown(leading, '# Host heading\n\nBody')).toMatchObject({ title: 'Host heading', editable: '\nBody' })
  })

  test('a source edit at offset zero cannot change the retained heading line', () => {
    const leading = setModelTitleSource(setModelMarkdown(markdownEditorModel(), '# Title\n\nBody'), 'leading-heading')
    expect(setModelEditable(leading, `X${leading.editable}`)).toMatchObject({
      title: 'Title',
      markdown: '# Title\nX\nBody',
      retained: '# Title\n',
    })
  })
})
