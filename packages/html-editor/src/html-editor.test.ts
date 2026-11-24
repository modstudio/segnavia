import './prosemirror-environment.test-helper.ts'
import './html-editor-environment.test-helper.ts'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { cleanHtml, type HtmlProfile } from '@segnavia/html'
import { htmlEditorTestSeam } from './html-editor-internals.ts'

const { SegnaviaHtmlEditor } = await import('./html-editor.ts')

const profile = {
  blocks: { p: true, h: [2], ul: true, ol: { start: true } },
  marks: ['bold', 'italic', 'underline', 'link'],
  links: { schemes: ['https'] },
  align: ['start', 'center', 'end'],
  direction: true,
} satisfies HtmlProfile

function mount(profileValue: HtmlProfile, html = '') {
  const element = new SegnaviaHtmlEditor()
  element.profile = profileValue
  element.html = html
  document.body.append(element)
  return { editor: htmlEditorTestSeam.editor(element), element }
}

function expectFixedPoint(element: InstanceType<typeof SegnaviaHtmlEditor>): void {
  expect(htmlEditorTestSeam.editor(element).getHTML()).toBe(element.html)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('segnavia-html-editor', () => {
  test('round-trips a mixed fragment through the profile cleaner', () => {
    const input =
      '<div><span style="color:red">plain</span><b>old bold</b><strong>bold</strong></div><h2><em>title</em></h2><p dir="rtl">שלום</p><p style="text-align:center">centered</p>'
    const { element } = mount(profile, input)

    expect(element.html).toBe(cleanHtml(input, profile).html)
    expectFixedPoint(element)
  })

  test('toggles bold over a selection on and off', () => {
    const { editor, element } = mount(profile, '<p>one two</p>')
    editor.commands.setTextSelection({ from: 1, to: 4 })

    expect(element.run('bold')).toBe(true)
    expect(element.html).toBe('<p><strong>one</strong> two</p>')
    expectFixedPoint(element)

    expect(element.run('bold')).toBe(true)
    expect(element.html).toBe('<p>one two</p>')
    expectFixedPoint(element)
  })

  test('refuses underline outside the profile and disables its command', () => {
    const withoutUnderline = { ...profile, marks: profile.marks.filter((mark) => mark !== 'underline') }
    const { element } = mount(withoutUnderline, '<p>x</p>')

    expect(element.commands.underline.enabled).toBe(false)
    expect(() => element.run('underline')).toThrow(/profile\.marks\.underline/)
    expectFixedPoint(element)
  })

  test('writes admitted logical alignment and refuses a value outside profile.align', () => {
    const { element } = mount(profile, '<p>x</p>')

    expect(element.run('align', { value: 'center' })).toBe(true)
    expect(element.html).toBe('<p style="text-align:center">x</p>')
    expectFixedPoint(element)

    expect(() => element.run('align', { value: 'left' })).toThrow(/profile\.align/)
    expectFixedPoint(element)
  })

  test('reports dropped content only when opening HTML loses content', () => {
    const { element } = mount(profile, '<p>clean</p>')
    const dropped: CustomEvent[] = []
    element.addEventListener('segnavia-html-dropped', (event) => dropped.push(event as CustomEvent))

    element.html = '<div><span style="color:red">changed</span></div>'
    expect(dropped).toHaveLength(1)
    expect(dropped[0]?.detail.dropped).toBe(element.dropped)
    expect(element.dropped).toEqual(cleanHtml('<div><span style="color:red">changed</span></div>', profile).dropped)
    expectFixedPoint(element)

    element.html = '<p>clean again</p>'
    expect(dropped).toHaveLength(1)
    expect(element.dropped).toEqual([])
    expectFixedPoint(element)
  })

  test('omits default direction and writes an explicit rtl direction', () => {
    const { element } = mount(profile, '<p>x</p>')

    expect(element.html).toBe('<p>x</p>')
    expect(element.run('direction', { value: 'rtl' })).toBe(true)
    expect(element.html).toBe('<p dir="rtl">x</p>')
    expectFixedPoint(element)
  })

  test('emits command state once for a real change and not for an unchanged transaction', () => {
    const { editor, element } = mount(profile, '<p><strong>bold</strong> plain</p>')
    editor.commands.setTextSelection(8)
    const states: CustomEvent[] = []
    element.addEventListener('segnavia-editor-state', (event) => states.push(event as CustomEvent))

    editor.commands.setTextSelection(2)
    expect(states).toHaveLength(1)
    expect(states[0]?.detail.bold.active).toBe(true)
    editor.view.dispatch(editor.state.tr)
    expect(states).toHaveLength(1)
    expectFixedPoint(element)
  })

  test('keeps the selection when typing into a centered paragraph without correcting content', () => {
    const { editor, element } = mount(profile, '<p>ab</p>')
    expect(element.run('align', { value: 'center' })).toBe(true)
    expectFixedPoint(element)
    editor.commands.setTextSelection(2)
    const setContent = spyOn(htmlEditorTestSeam, 'setContent')

    expect(editor.commands.insertContent('X')).toBe(true)
    expect(element.html).toBe('<p style="text-align:center">aXb</p>')
    expect(editor.state.selection.from).toBe(3)
    expect(setContent).not.toHaveBeenCalled()
    expectFixedPoint(element)
  })
})
