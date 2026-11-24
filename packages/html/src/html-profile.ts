import { z } from 'zod'
import { type LinkPolicy, resolveLinkPolicy } from './link-policy.ts'

export type HtmlProfileBlock = 'p' | 'h' | 'ul' | 'ol' | 'hr'
export type HtmlProfileMark = 'bold' | 'italic' | 'underline' | 'link'
export type HtmlProfileLinkScheme = 'https' | 'http' | 'mailto' | 'tel'
export type HtmlProfileAlignment = 'start' | 'center' | 'end'

export interface HtmlProfile {
  blocks: {
    p?: true
    h?: (1 | 2 | 3 | 4 | 5 | 6)[]
    ul?: true
    ol?: { start?: true }
    hr?: true
  }
  marks: HtmlProfileMark[]
  links?: { schemes: HtmlProfileLinkScheme[] }
  align?: HtmlProfileAlignment[]
  direction?: true
  atoms?: { pattern: 'double-brace' }
}

interface HtmlProfileElementMapping {
  tags: readonly string[]
  attributes: readonly string[]
}

export const HTML_PROFILE_MAPPING = {
  blocks: {
    p: { tags: ['p'], attributes: [] },
    h: { tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], attributes: [] },
    ul: { tags: ['ul', 'li'], attributes: [] },
    ol: { tags: ['ol', 'li'], attributes: ['start'] },
    hr: { tags: ['hr'], attributes: [] },
  },
  marks: {
    bold: { tags: ['strong'], attributes: [] },
    italic: { tags: ['em'], attributes: [] },
    underline: { tags: ['u'], attributes: [] },
    link: { tags: ['a'], attributes: ['href'] },
  },
  align: { attribute: 'style', property: 'text-align' },
  direction: { attribute: 'dir' },
  atoms: { pattern: 'double-brace' },
} as const satisfies {
  blocks: Record<HtmlProfileBlock, HtmlProfileElementMapping>
  marks: Record<HtmlProfileMark, HtmlProfileElementMapping>
  align: { attribute: 'style'; property: 'text-align' }
  direction: { attribute: 'dir' }
  atoms: { pattern: 'double-brace' }
}

const mark = z.enum(['bold', 'italic', 'underline', 'link'], {
  error: (issue) => `unknown HTML profile mark ${JSON.stringify(issue.input)}; use bold, italic, underline or link to clear this refusal`,
})
const linkScheme = z.enum(['https', 'http', 'mailto', 'tel'], {
  error: (issue) => `unknown HTML profile link scheme ${JSON.stringify(issue.input)}; use https, http, mailto or tel to clear this refusal`,
})

const schema: z.ZodType<HtmlProfile> = z.strictObject({
  blocks: z.strictObject({
    p: z.literal(true).optional(),
    h: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])).optional(),
    ul: z.literal(true).optional(),
    ol: z.strictObject({ start: z.literal(true).optional() }).optional(),
    hr: z.literal(true).optional(),
  }),
  marks: z.array(mark),
  links: z.strictObject({ schemes: z.array(linkScheme) }).optional(),
  align: z.array(z.enum(['start', 'center', 'end'])).optional(),
  direction: z.literal(true).optional(),
  atoms: z.strictObject({ pattern: z.literal('double-brace') }).optional(),
})

function validateLinks(links: HtmlProfile['links']): void {
  if (!links) return
  const policy: LinkPolicy = { protocols: links.schemes.map((scheme) => `${scheme}:`) }
  resolveLinkPolicy(policy)
}

export const HtmlProfile = {
  parse(input: unknown): HtmlProfile {
    const profile = schema.parse(input)
    validateLinks(profile.links)
    return profile
  },
}
