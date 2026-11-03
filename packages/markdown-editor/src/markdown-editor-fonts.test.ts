import { expect, test } from 'bun:test'
import type { AppFont, FontFace as FontFaceData } from '@segnavia/format'
import { FontRefusedError } from '@segnavia/frame/fonts'
import { registerMarkdownEditorFonts } from './markdown-editor-fonts.ts'

const data = new Uint8Array([1])
const face: FontFaceData = { family: 'Body', data, format: 'truetype' }
const font: AppFont = { family: 'Body', faces: [face] }

function restoreGlobal(name: 'document' | 'FontFace', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else Reflect.deleteProperty(globalThis, name)
}

function elementStyle() {
  const values = new Map<string, string>()
  return {
    element: {
      style: { setProperty: (name: string, value: string) => values.set(name, value), removeProperty: (name: string) => values.delete(name) },
    } as unknown as HTMLElement,
    values,
  }
}

test('font registration follows the page app-name refusal', async () => {
  const { element } = elementStyle()
  await expect(
    registerMarkdownEditorFonts(element, [{ app: 'My Font' }], { source: { font: async () => font } }, new AbortController().signal),
  ).rejects.toThrow(FontRefusedError)
})

test('font registration rolls back properties and faces after a partial failure', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalFontFace = Object.getOwnPropertyDescriptor(globalThis, 'FontFace')
  const added = new Set<object>()
  class TestFontFace {
    async load() {
      throw new Error('face load failed')
    }
  }
  Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: TestFontFace })
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { fonts: { add: (value: object) => added.add(value), delete: (value: object) => added.delete(value) } },
  })
  const { element, values } = elementStyle()
  try {
    await expect(
      registerMarkdownEditorFonts(element, [{ app: 'body' }, { app: 'body' }], { source: { font: async () => font } }, new AbortController().signal),
    ).rejects.toThrow('face load failed')
    expect(values.size).toBe(0)
    expect(added.size).toBe(0)
  } finally {
    restoreGlobal('FontFace', originalFontFace)
    restoreGlobal('document', originalDocument)
  }
})

test('font registration rolls back work when aborted during a face load', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalFontFace = Object.getOwnPropertyDescriptor(globalThis, 'FontFace')
  let finishLoad: (() => void) | undefined
  class TestFontFace {
    load() {
      return new Promise<TestFontFace>((resolve) => {
        finishLoad = () => resolve(this)
      })
    }
  }
  Object.defineProperty(globalThis, 'FontFace', { configurable: true, value: TestFontFace })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { add: () => undefined, delete: () => true } } })
  const { element, values } = elementStyle()
  const controller = new AbortController()
  try {
    const registration = registerMarkdownEditorFonts(element, [{ app: 'body' }], { source: { font: async () => font } }, controller.signal)
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    finishLoad?.()
    await expect(registration).rejects.toThrow()
    expect(values.size).toBe(0)
  } finally {
    restoreGlobal('FontFace', originalFontFace)
    restoreGlobal('document', originalDocument)
  }
})
