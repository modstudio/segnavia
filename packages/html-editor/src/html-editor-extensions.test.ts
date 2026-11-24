import './prosemirror-environment.test-helper.ts'
import { describe, expect, test } from 'bun:test'
import { HtmlProfile } from '@segnavia/html'
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
})
