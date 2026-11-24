import { describe, expect, test } from 'bun:test'
import { HtmlProfile } from '@segnavia/html'
import { commandAdmitted, commandRefusal } from './html-editor-commands.ts'

const profile = HtmlProfile.parse({
  blocks: { p: true, h: [2], ul: true },
  marks: ['bold'],
  links: { schemes: ['https'] },
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
    expect(commandRefusal(profile, 'align')?.message).toContain('profile.align')
    expect(commandRefusal(profile, 'align', { value: 'end' })?.message).toContain('profile.align')
    expect(commandRefusal(profile, 'direction', { value: 'sideways' })?.message).toContain('profile.direction')
  })

  test('requires both the link mark and an admitted href scheme', () => {
    const links = { ...profile, marks: [...profile.marks, 'link' as const] }
    expect(commandAdmitted(links, 'link')).toBe(true)
    expect(commandRefusal(links, 'link', { href: 'mailto:x@example.com' })?.message).toContain('profile.links.schemes')
    expect(commandRefusal({ ...links, links: undefined }, 'link', { href: 'https://example.com' })?.message).toContain('profile.links.schemes')
  })
})
