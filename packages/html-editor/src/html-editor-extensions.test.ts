import './prosemirror-environment.test-helper.ts'
import { describe, expect, test } from 'bun:test'
import { HtmlProfile } from '@segnavia/html'
import { getExtensionField } from '@tiptap/core'
import { htmlEditorExtensions } from './html-editor-extensions.ts'

describe('HTML editor extensions', () => {
  test('contains only nodes and marks admitted by the profile plus editor structure', () => {
    const profile = HtmlProfile.parse({ blocks: { p: true, h: [2] }, marks: ['bold'], direction: true })
    const names = htmlEditorExtensions(profile).map(({ name }) => name)
    expect(names).toContain('doc')
    expect(names).toContain('paragraph')
    expect(names).toContain('heading')
    expect(names).toContain('bold')
    expect(names).toContain('htmlProfileAttributes')
    expect(names).not.toContain('italic')
    expect(names).not.toContain('bulletList')
  })

  test('keeps an absent direction absent and writes an explicit direction', () => {
    const profile = HtmlProfile.parse({ blocks: { p: true }, marks: [], direction: true })
    const extension = htmlEditorExtensions(profile).find(({ name }) => name === 'htmlProfileAttributes')
    if (!extension) throw new Error('expected profile attributes')
    const globals = getExtensionField(extension, 'addGlobalAttributes', {
      name: extension.name,
      options: extension.options,
      storage: extension.storage,
    })?.()
    const direction = globals?.[0]?.attributes.dir
    if (!direction) throw new Error('expected direction attribute')
    const element = { getAttribute: () => null } as unknown as HTMLElement
    expect(direction.parseHTML?.(element)).toBeNull()
    expect(direction.renderHTML?.({ dir: null })).toEqual({})
    expect(direction.renderHTML?.({ dir: 'rtl' })).toEqual({ dir: 'rtl' })
    const invalid = { getAttribute: () => 'sideways' } as unknown as HTMLElement
    expect(direction.parseHTML?.(invalid)).toBeNull()
  })

  test('parses only alignment values admitted by the profile', () => {
    const profile = HtmlProfile.parse({ blocks: { p: true }, marks: [], align: ['center'] })
    const extension = htmlEditorExtensions(profile).find(({ name }) => name === 'htmlProfileAttributes')
    if (!extension) throw new Error('expected profile attributes')
    const globals = getExtensionField(extension, 'addGlobalAttributes', {
      name: extension.name,
      options: extension.options,
      storage: extension.storage,
    })?.()
    const alignment = globals?.[0]?.attributes.textAlign
    if (!alignment) throw new Error('expected alignment attribute')
    const element = (value: string) => ({ style: { getPropertyValue: () => value } }) as unknown as HTMLElement
    expect(alignment.parseHTML?.(element('center'))).toBe('center')
    expect(alignment.parseHTML?.(element('end'))).toBeNull()
  })
})
