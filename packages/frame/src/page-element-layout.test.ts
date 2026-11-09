import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { toggleTestAttribute } from './page-element.test-helper.ts'
import { clearPageFrame, fitPageFrame, mountPageFrame } from './page-element-layout.ts'

function style() {
  return {
    height: '',
    transform: '',
    inlineSize: '',
    removeProperty(name: string) {
      if (name === 'height') this.height = ''
      if (name === 'transform') this.transform = ''
    },
  }
}

function harness() {
  const attributes = new Set<string>()
  const element = {
    clientWidth: 800,
    dataset: {} as Record<string, string>,
    style: style(),
    replaceChildren() {},
    removeAttribute(name: string) {
      attributes.delete(name)
    },
    setAttribute(name: string) {
      attributes.add(name)
    },
    toggleAttribute(name: string, force?: boolean) {
      return toggleTestAttribute(this as unknown as HTMLElement, name, force)
    },
    hasAttribute(name: string) {
      return attributes.has(name)
    },
  } as unknown as HTMLElement
  Object.assign(globalThis, {
    document: {
      createElement(tag: string) {
        if (tag === 'iframe') return { setAttribute() {}, title: '' }
        return { className: '', dir: '', style: style(), append() {} }
      },
    },
  })
  return element
}

const plain = Page.parse({ html: '<p>Page</p>', size: { width: 600, height: 400 } })
const bounded = Page.parse({ html: '<p>Page</p>', size: { width: 'full', height: 'auto' } })
const printed = Page.parse({
  html: '<p>Paper</p>',
  print: { paper: 'letter' },
  printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
})

test('host height survives a bounded full page followed by composed papers', () => {
  const element = harness()
  const sheet = { style: style() } as unknown as HTMLElement
  const height = { contentHeight: 640, ownsElementHeight: false }
  element.style.height = '500px'
  fitPageFrame(element, bounded, sheet, height, true)
  expect(element.style.height).toBe('500px')
  fitPageFrame(element, printed, sheet, height, false)
  expect(element.style.height).toBe('500px')
})

test('a library-written height is cleared by the next composed or bounded fit', () => {
  const element = harness()
  const sheet = { style: style() } as unknown as HTMLElement
  const height = { contentHeight: 400, ownsElementHeight: false }
  fitPageFrame(element, plain, sheet, height, false)
  expect(element.style.height).toBe('400px')
  expect(element.dataset.height).toBe('400')
  fitPageFrame(element, printed, sheet, height, false)
  expect(element.style.height).toBe('')
  expect(element.dataset.height).toBeUndefined()

  fitPageFrame(element, plain, sheet, height, false)
  fitPageFrame(element, bounded, sheet, height, true)
  expect(element.style.height).toBe('')
  expect(element.dataset.height).toBe('400')
})

test('mounting tracks whether the current frame shows composed papers', () => {
  const element = harness()
  mountPageFrame(element, plain, undefined, '')
  expect(element.hasAttribute('data-composed-papers')).toBe(false)
  mountPageFrame(element, printed, undefined, '')
  expect(element.hasAttribute('data-composed-papers')).toBe(true)
  mountPageFrame(element, plain, undefined, '')
  expect(element.hasAttribute('data-composed-papers')).toBe(false)
  mountPageFrame(element, printed, undefined, '')
  expect(element.hasAttribute('data-composed-papers')).toBe(true)
  clearPageFrame(element, { contentHeight: 0, ownsElementHeight: false })
  expect(element.hasAttribute('data-composed-papers')).toBe(false)
})
