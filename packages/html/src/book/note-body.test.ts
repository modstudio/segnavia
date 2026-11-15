import { expect, test } from 'bun:test'
import render from 'dom-serializer'
import { Element, Text } from 'domhandler'
import { noteBody } from './note-body.ts'

const text = (value: string) => new Text(value)
const element = (name: string, children: Element['children']) => new Element(name, {}, children)

test('uses a paragraph and keeps inline-only note output unchanged', () => {
  expect(render(noteBody('note', 'n-1', [text('1'), text(' ')], [text('words'), element('em', [text(' cited')])]))).toBe(
    '<p class="note" id="n-1">1 words<em> cited</em></p>',
  )
})

test('holds block content in a div and runs the lead into its deepest first text block', () => {
  const content = [element('blockquote', [element('section', [element('p', [text('first')])])]), element('p', [text('second')])]
  expect(render(noteBody('note', 'n-1', [text('1'), text(' ')], content))).toBe(
    '<div class="note" id="n-1"><blockquote><section><p>1 first</p></section></blockquote><p>second</p></div>',
  )
})

test('leaves the lead before a first child that does not hold running text', () => {
  const content = [element('ul', [element('li', [text('first')])]), element('p', [text('second')])]
  expect(render(noteBody('note', 'n-1', [text('1'), text(' ')], content))).toBe('<div class="note" id="n-1">1 <ul><li>first</li></ul><p>second</p></div>')
})

test('uses a div for other elements whose start tag closes a paragraph', () => {
  for (const name of ['details', 'figure', 'figcaption', 'table', 'hr', 'form', 'dl']) {
    expect(noteBody('note', 'n-1', [text('1')], [element(name, [])]).name).toBe('div')
  }
})
