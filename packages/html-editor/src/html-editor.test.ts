import './prosemirror-environment.test-helper.ts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { cleanHtml, type HtmlProfile } from '@segnavia/html'
import { closeHtmlEditorTestEnvironment, installHtmlEditorTestEnvironment } from './html-editor-environment.test-helper.ts'
import { htmlEditorTestSeam } from './html-editor-internals.ts'

let SegnaviaHtmlEditor: typeof import('./html-editor.ts').SegnaviaHtmlEditor
let restoreEnvironment: () => void

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

beforeAll(async () => {
  const restore = installHtmlEditorTestEnvironment()
  ;({ SegnaviaHtmlEditor } = await import('./html-editor.ts'))
  restore()
})

beforeEach(() => {
  restoreEnvironment = installHtmlEditorTestEnvironment()
})

afterEach(() => {
  document.body.replaceChildren()
  restoreEnvironment()
})

afterAll(() => closeHtmlEditorTestEnvironment())

describe('segnavia-html-editor', () => {
  test('round-trips every admitted HTML form through the profile cleaner', () => {
    const inputs = [
      '<div><span style="color:red">plain</span><b>old bold</b><strong>bold</strong></div><h2><em>title</em></h2>',
      '<ul><li>one</li><li><strong>two</strong></li></ul>',
      '<ol start="3"><li>three</li></ol>',
      '<h2>heading</h2>',
      '<p style="text-align:center">centered</p>',
      '<p dir="rtl">שלום</p>',
      '<p><a href="https://example.com/path">link</a></p>',
    ]
    for (const input of inputs) {
      const { element } = mount(profile, input)
      expect(element.html).toBe(cleanHtml(input, profile).html)
      expect(cleanHtml(element.html, profile).html).toBe(element.html)
      element.remove()
    }
  })

  test('toggles bold over a selection on and off', () => {
    const { editor, element } = mount(profile, '<p>one two</p>')
    editor.commands.setTextSelection({ from: 1, to: 4 })

    expect(element.run('bold')).toBe(true)
    expect(element.html).toBe('<p><strong>one</strong> two</p>')
    expect(cleanHtml(element.html, profile).html).toBe(element.html)

    expect(element.run('bold')).toBe(true)
    expect(element.html).toBe('<p>one two</p>')
    expect(cleanHtml(element.html, profile).html).toBe(element.html)
  })

  test('refuses underline outside the profile and disables its command', () => {
    const withoutUnderline = { ...profile, marks: profile.marks.filter((mark) => mark !== 'underline') }
    const { element } = mount(withoutUnderline, '<p>x</p>')

    expect(element.commands.underline.enabled).toBe(false)
    expect(() => element.run('underline')).toThrow(/profile\.marks\.underline/)
  })

  test('writes admitted logical alignment and refuses a value outside profile.align', () => {
    const { element } = mount(profile, '<p>x</p>')

    expect(element.run('align', { value: 'center' })).toBe(true)
    expect(element.html).toBe('<p style="text-align:center">x</p>')
    expect(cleanHtml(element.html, profile).html).toBe(element.html)

    expect(() => element.run('align', { value: 'left' })).toThrow(/profile\.align/)
    expect(() => element.run('align')).toThrow(/profile\.align/)
  })

  test('reports dropped content only when opening HTML loses content', () => {
    const { element } = mount(profile, '<p>clean</p>')
    const dropped: CustomEvent[] = []
    element.addEventListener('segnavia-html-dropped', (event) => dropped.push(event as CustomEvent))

    element.html = '<div><span style="color:red">changed</span></div>'
    expect(dropped).toHaveLength(1)
    expect(dropped[0]?.detail.dropped).toBe(element.dropped)
    expect(element.dropped).toEqual(cleanHtml('<div><span style="color:red">changed</span></div>', profile).dropped)

    element.html = '<p>clean again</p>'
    expect(dropped).toHaveLength(1)
    expect(element.dropped).toEqual([])
  })

  test('omits default direction and writes an explicit rtl direction', () => {
    const { element } = mount(profile, '<p>x</p>')

    expect(element.html).toBe('<p>x</p>')
    expect(element.run('direction', { value: 'rtl' })).toBe(true)
    expect(element.html).toBe('<p dir="rtl">x</p>')
    expect(cleanHtml(element.html, profile).html).toBe(element.html)
    expect(() => element.run('direction', { value: 'sideways' })).toThrow(/profile\.direction/)
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
  })

  test('emits one HTML change for a real edit and none for opening or an unchanged transaction', () => {
    const { editor, element } = mount(profile, '<p>one two</p>')
    const changes: CustomEvent[] = []
    element.addEventListener('segnavia-html-change', (event) => changes.push(event as CustomEvent))

    element.html = '<p>opened</p>'
    expect(changes).toHaveLength(0)
    editor.commands.setTextSelection({ from: 1, to: 7 })
    expect(element.run('bold')).toBe(true)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.detail).toEqual({ html: '<p><strong>opened</strong></p>' })
    editor.view.dispatch(editor.state.tr)
    expect(changes).toHaveLength(1)
  })

  test('refuses links without a link policy or with a scheme outside it', () => {
    const { element } = mount(profile, '<p>x</p>')
    expect(() => element.run('link', { href: 'mailto:x@example.com' })).toThrow(/profile\.links\.schemes/)

    const { element: withoutLinks } = mount({ blocks: { p: true }, marks: ['link'] }, '<p>x</p>')
    expect(withoutLinks.commands.link.enabled).toBe(false)
    expect(() => withoutLinks.run('link', { href: 'https://example.com' })).toThrow(/profile\.links\.schemes/)
  })

  test('keeps the selection when typing into a centered paragraph without correcting content', () => {
    const { editor, element } = mount(profile, '<p>ab</p>')
    expect(element.run('align', { value: 'center' })).toBe(true)
    editor.commands.setTextSelection(2)
    expect(editor.commands.insertContent('X')).toBe(true)
    expect(element.html).toBe('<p style="text-align:center">aXb</p>')
    expect(editor.state.selection.from).toBe(3)
    expect(cleanHtml(element.html, profile).html).toBe(element.html)
  })
})
