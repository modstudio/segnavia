import { describe, expect, test } from 'bun:test'
import { HtmlProfile } from '@segnavia/html'
import { commandAdmitted, commandRefusal } from './html-editor-policy.ts'

const profile = HtmlProfile.parse({
  blocks: { p: true, h: [2], ul: true },
  marks: ['bold'],
  align: ['start', 'center'],
  direction: true,
})

describe('HTML editor command policy', () => {
  test('names the profile field that would admit a refused command', () => {
    expect(commandAdmitted(profile, 'underline')).toBe(false)
    expect(commandRefusal(profile, 'underline')?.message).toContain('profile.marks.underline')
  })

  test('limits heading levels and logical alignment values to the profile', () => {
    expect(commandAdmitted(profile, 'heading')).toBe(true)
    expect(commandAdmitted(profile, 'heading', { level: 2 })).toBe(true)
    expect(commandRefusal(profile, 'heading', { level: 1 })?.message).toContain('profile.blocks.h')
    expect(commandAdmitted(profile, 'align', { value: 'center' })).toBe(true)
    expect(commandAdmitted(profile, 'align')).toBe(true)
    expect(commandRefusal(profile, 'align', { value: 'end' })?.message).toContain('profile.align')
  })
})
