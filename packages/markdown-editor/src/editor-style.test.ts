import { describe, expect, test } from 'bun:test'
import './prosemirror-environment.test-helper.ts'
import { EDITOR_CSS } from './editor-css.ts'

class RecordingElement {
  readonly attributes = new Map<string, string>()
  readonly children: RecordingElement[] = []
  readonly dataset = new Proxy<Record<string, string>>(
    {},
    {
      set: (target, property, value) => {
        target[String(property)] = String(value)
        return true
      },
    },
  )
  readonly style = { cssText: '' }
  checked = false
  contentEditable = ''
  textContent = ''
  type = ''

  constructor(readonly localName: string) {}

  addEventListener() {}

  append(...children: RecordingElement[]) {
    this.children.push(...children)
  }

  getAttribute(name: string): string | null {
    if (name.startsWith('data-')) return this.dataset[name.slice(5)] ?? null
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
  }

  setAttribute(name: string, value: unknown) {
    this.attributes.set(name, String(value))
  }

  matches(selector: string): boolean {
    const simple = selector.match(/^([a-z]+)(?:\[([a-z-]+)(?:="([^"]+)")?\])$/)
    if (!simple) return false
    const [, tag, attribute, expected] = simple
    const actual = attribute ? this.getAttribute(attribute) : null
    return this.localName === tag && actual !== null && (expected === undefined || actual === expected)
  }
}

function taskSelector(declaration: string): string {
  const rule = [...EDITOR_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{([^{}]+)\}/g)].find((match) => match[2]?.includes(declaration))
  if (!rule?.[1]) throw new Error(`expected a task rule containing ${declaration}`)
  const selector = rule[1].trim()
  const rich = '[part~="rich"] '
  const start = selector.indexOf(rich)
  if (start < 0 || !selector.endsWith(')')) throw new Error(`expected a rich-mode :where() selector for ${declaration}`)
  return selector.slice(start + rich.length, -1)
}

describe('markdown editor styles', () => {
  test('every selector sits wholly inside :where()', () => {
    const selectors = [...EDITOR_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim()).toMatch(/^:where\(.*\)$/)
    }
  })

  test('every selector is scoped to a styled markdown editor', () => {
    const selectors = [...EDITOR_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part).toContain(':host(segnavia-markdown-editor:not([unstyled]))')
    }
  })

  test('color literals appear only as custom-property defaults', () => {
    for (const color of EDITOR_CSS.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []) {
      expect(EDITOR_CSS).toMatch(new RegExp(`var\\(--segnavia-[a-z-]+,${color.replace('(', '\\(')}`))
    }
  })

  test('task selectors match the attributes written by the live task-item node view', async () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
    const document = {
      createElement: (name: string) => new RecordingElement(name),
      documentElement: { style: {} },
    }
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
    try {
      const { TaskItem } = await import('@tiptap/extension-list')
      const taskItem = TaskItem.configure({ nested: true })
      const addNodeView = taskItem.config.addNodeView as unknown as (() => (properties: Record<string, unknown>) => { dom: unknown }) | undefined
      if (!addNodeView) throw new Error('expected TaskItem to provide a node view')
      const nodeView = addNodeView.call(taskItem)({
        node: { attrs: { checked: false }, textContent: 'Pending' },
        HTMLAttributes: { dir: 'auto' },
        editor: {},
      })
      const item = nodeView.dom as unknown as RecordingElement
      expect(item.localName).toBe('li')
      expect(item.getAttribute('data-checked')).toBe('false')
      expect(item.getAttribute('data-type')).toBeNull()
      expect(item.matches(taskSelector('grid-template-columns:auto'))).toBe(true)

      const list = new RecordingElement('ul')
      list.append(item)
      const listSelector = taskSelector('list-style:none').match(/^([a-z]+):has\(> (.+)\)$/)
      if (!listSelector) throw new Error('expected the task-list rule to select a list by its direct task-item child')
      const listName = listSelector[1]
      const childSelector = listSelector[2]
      if (!listName || !childSelector) throw new Error('expected names for the task list and task item selectors')
      expect(list.localName).toBe(listName)
      expect(list.children.some((child) => child.matches(childSelector))).toBe(true)
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
      else Reflect.deleteProperty(globalThis, 'document')
    }
  })
})
