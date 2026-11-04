import { afterAll, beforeAll, expect, test } from 'bun:test'
import { MARKDOWN_EDITOR_PROPERTIES } from './element-properties.ts'
import { markdownEditorModel } from './markdown-editor-model.ts'

const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
const previousCustomElements = Object.getOwnPropertyDescriptor(globalThis, 'customElements')
let editor: typeof import('./markdown-editor.ts')

beforeAll(async () => {
  class HTMLElement extends EventTarget {
    attributes = new Map<string, string>()
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null
    }
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value)
    }
    removeAttribute(name: string) {
      this.attributes.delete(name)
    }
  }
  const registry = new Map<string, CustomElementConstructor>()
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: HTMLElement })
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    value: {
      define: (name: string, elementClass: CustomElementConstructor) => registry.set(name, elementClass),
      get: (name: string) => registry.get(name),
    },
  })
  editor = await import('./markdown-editor.ts')
})

afterAll(() => {
  if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
  else Reflect.deleteProperty(globalThis, 'HTMLElement')
  if (previousCustomElements) Object.defineProperty(globalThis, 'customElements', previousCustomElements)
  else Reflect.deleteProperty(globalThis, 'customElements')
})

test('every declared editor property has a setter', () => {
  for (const property of MARKDOWN_EDITOR_PROPERTIES.properties) {
    let prototype: object | null = editor.SegnaviaMarkdownEditor.prototype
    let accessor: PropertyDescriptor | undefined
    while (prototype && !accessor) {
      accessor = Object.getOwnPropertyDescriptor(prototype, property)
      prototype = Object.getPrototypeOf(prototype)
    }
    expect(accessor?.set, `${MARKDOWN_EDITOR_PROPERTIES.tag}.${property}`).toBeFunction()
  }
})

function editorState() {
  const element = Object.create(editor.SegnaviaMarkdownEditor.prototype) as {
    attributes: Map<string, string>
    model: ReturnType<typeof markdownEditorModel>
    reflecting: boolean
    titleField: { hidden: boolean; value: string }
    attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void
    getAttribute(name: string): string | null
    title: string
  }
  element.attributes = new Map<string, string>()
  element.model = markdownEditorModel()
  element.reflecting = false
  element.titleField = { hidden: false, value: '' }
  return element
}

test('a title attribute set before upgrade becomes the document title', () => {
  const element = editorState()
  element.attributes.set('title', 'Before upgrade')
  element.attributeChangedCallback('title', null, 'Before upgrade')
  expect(element.title).toBe('Before upgrade')
  expect(element.getAttribute('title')).toBeNull()
})

test('changing the title attribute after upgrade changes the document title', () => {
  const element = editorState()
  element.attributes.set('title', 'Changed')
  element.attributeChangedCallback('title', null, 'Changed')
  expect(element.title).toBe('Changed')
  expect(element.getAttribute('title')).toBeNull()
})

test('setting the title property after upgrade does not add a title attribute', () => {
  const element = editorState()
  element.title = 'Property title'
  expect(element.title).toBe('Property title')
  expect(element.getAttribute('title')).toBeNull()
})
