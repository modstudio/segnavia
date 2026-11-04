import { describe, expect, test } from 'bun:test'
import { linkAllowed, resolveLinkPolicy } from './link-policy.ts'

describe('link policy', () => {
  test('allows listed protocols and applies an origin filter only to http links', () => {
    const policy = resolveLinkPolicy({ protocols: ['https:', 'mailto:'], origins: ['https://inside.example'] })
    expect(linkAllowed('https://inside.example/page', policy)).toBe(true)
    expect(linkAllowed('https://outside.example/page', policy)).toBe(false)
    expect(linkAllowed('mailto:editor@example.com', policy)).toBe(true)
    expect(linkAllowed('/relative', policy)).toBe(false)
  })

  test('allows fragments by default and can refuse them explicitly', () => {
    expect(linkAllowed('#section', resolveLinkPolicy({ protocols: ['https:'] }))).toBe(true)
    expect(linkAllowed('#section', resolveLinkPolicy({ protocols: ['https:'], fragments: false }))).toBe(false)
  })

  test.each(['javascript:', 'vbscript:', 'data:'])('refuses forbidden protocol %s at the edge and in the decision', (protocol) => {
    expect(() => resolveLinkPolicy({ protocols: [protocol] })).toThrow(
      `links.protocols contains ${JSON.stringify(protocol)}; remove it from links.protocols to clear this refusal`,
    )
    expect(linkAllowed(`${protocol}payload`, { protocols: new Set([protocol]), fragments: true })).toBe(false)
  })
})
