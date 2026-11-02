import { describe, expect, test } from 'bun:test'
import { markdownEditorModel, setModelEditable, setModelMarkdown, setModelTitle, setModelTitleSource } from './markdown-editor-model.ts'

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
    expect(setModelTitleSource(body, 'leading-heading')).toMatchObject({ title: 'שלום', editable: '\n\nBody', retained: '# שלום' })
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
    expect(setModelTitle(leading, '')).toMatchObject({ title: '', markdown: '\n\nBody', retained: '' })
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
    expect(setModelMarkdown(leading, '# Host heading\n\nBody')).toMatchObject({ title: 'Host heading', editable: '\n\nBody' })
  })
})
