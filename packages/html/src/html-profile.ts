import { closedObject } from '@segnavia/format'
import { z } from 'zod'
import { type ResolvedLinkPolicy, resolveLinkPolicy } from './link-policy.ts'

export type HtmlProfileBlock = 'p' | 'h' | 'ul' | 'ol' | 'hr'
export const HTML_PROFILE_MARKS = ['bold', 'italic', 'underline', 'link'] as const
export const HTML_PROFILE_LINK_SCHEMES = ['https', 'http', 'mailto', 'tel'] as const
export const HTML_PROFILE_ALIGNMENTS = ['start', 'center', 'end'] as const
export const HTML_PROFILE_HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const
export const HTML_PROFILE_DIRECTIONS = ['auto', 'rtl', 'ltr'] as const

export type HtmlProfileMark = (typeof HTML_PROFILE_MARKS)[number]
export type HtmlProfileLinkScheme = (typeof HTML_PROFILE_LINK_SCHEMES)[number]
export type HtmlProfileAlignment = (typeof HTML_PROFILE_ALIGNMENTS)[number]
export type HtmlProfileHeadingLevel = (typeof HTML_PROFILE_HEADING_LEVELS)[number]
export type HtmlProfileDirection = (typeof HTML_PROFILE_DIRECTIONS)[number]

export interface HtmlProfile {
  blocks: {
    p?: true
    h?: HtmlProfileHeadingLevel[]
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

export interface HtmlProfileElementMapping {
  tags: readonly string[]
  attributes: readonly string[]
}

export const HTML_PROFILE_MAPPING = {
  blocks: {
    p: { tags: ['p'], attributes: [] },
    h: { tags: HTML_PROFILE_HEADING_LEVELS.map((level) => `h${level}`), attributes: [] },
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
  direction: { attribute: 'dir', values: HTML_PROFILE_DIRECTIONS },
  atoms: { pattern: 'double-brace' },
} as const satisfies {
  blocks: Record<HtmlProfileBlock, HtmlProfileElementMapping>
  marks: Record<HtmlProfileMark, HtmlProfileElementMapping>
  align: { attribute: 'style'; property: 'text-align' }
  direction: { attribute: 'dir'; values: readonly HtmlProfileDirection[] }
  atoms: { pattern: 'double-brace' }
}

function refusedValue(input: unknown): string {
  if (typeof input === 'string') return JSON.stringify(input)
  try {
    return String(input)
  } catch {
    return 'an unprintable value'
  }
}

const mark = z.enum(HTML_PROFILE_MARKS, {
  error: (issue) => `unknown HTML profile mark ${refusedValue(issue.input)}; use ${HTML_PROFILE_MARKS.join(', ')} to clear this refusal`,
})
const linkScheme = z.enum(HTML_PROFILE_LINK_SCHEMES, {
  error: (issue) => `unknown HTML profile link scheme ${refusedValue(issue.input)}; use ${HTML_PROFILE_LINK_SCHEMES.join(', ')} to clear this refusal`,
})

const schema = closedObject(
  {
    blocks: closedObject(
      {
        p: z.literal(true).optional(),
        h: z.array(z.literal(HTML_PROFILE_HEADING_LEVELS)).optional(),
        ul: z.literal(true).optional(),
        ol: closedObject({ start: z.literal(true).optional() }, { startAt: 'use blocks.ol.start instead' }).optional(),
        hr: z.literal(true).optional(),
      },
      { headings: 'use blocks.h instead' },
    ),
    marks: z.array(mark),
    links: closedObject({ schemes: z.array(linkScheme) }, { protocols: 'use links.schemes instead' }).optional(),
    align: z.array(z.enum(HTML_PROFILE_ALIGNMENTS)).optional(),
    direction: z.literal(true).optional(),
    atoms: closedObject({ pattern: z.literal('double-brace') }, { type: 'use atoms.pattern instead' }).optional(),
  },
  {
    alignment: 'use align instead',
    atom: 'use atoms instead',
    block: 'use blocks instead',
    mark: 'use marks instead',
    schemes: 'use links.schemes instead',
    scripts: 'remove it; an HTML profile cannot admit scripts',
  },
)

export function profileLinkPolicy(profile: HtmlProfile): ResolvedLinkPolicy | undefined {
  if (!profile.links) return undefined
  return resolveLinkPolicy({ protocols: profile.links.schemes.map((scheme) => `${scheme}:`) })
}

function admitElement(elements: Record<string, string[]>, tag: string, attributes: readonly string[] = []): void {
  const admitted = elements[tag] ?? []
  for (const attribute of attributes) if (!admitted.includes(attribute)) admitted.push(attribute)
  elements[tag] = admitted
}

function profileBlockElements(profile: HtmlProfile, elements: Record<string, string[]>): Set<string> {
  const blockTags = new Set<string>()
  for (const block of Object.keys(profile.blocks) as HtmlProfileBlock[]) {
    if (profile.blocks[block] === undefined) continue
    if (block === 'h') {
      for (const level of profile.blocks.h ?? []) {
        const tag = HTML_PROFILE_MAPPING.blocks.h.tags[level - 1] as string
        admitElement(elements, tag)
        blockTags.add(tag)
      }
      continue
    }
    const mapping = HTML_PROFILE_MAPPING.blocks[block]
    for (const tag of mapping.tags) {
      const attributes = block === 'ol' && tag === 'ol' && profile.blocks.ol?.start ? mapping.attributes : []
      admitElement(elements, tag, attributes)
      blockTags.add(tag)
    }
  }
  return blockTags
}

export function profileElements(profile: HtmlProfile): Record<string, string[]> {
  const elements: Record<string, string[]> = {}
  const blockTags = profileBlockElements(profile, elements)

  for (const markName of profile.marks) {
    const mapping = HTML_PROFILE_MAPPING.marks[markName]
    for (const tag of mapping.tags) admitElement(elements, tag, mapping.attributes)
  }

  if (profile.align && profile.align.length > 0) {
    for (const tag of blockTags) admitElement(elements, tag, [HTML_PROFILE_MAPPING.align.attribute])
  }
  if (profile.direction) for (const tag of blockTags) admitElement(elements, tag, [HTML_PROFILE_MAPPING.direction.attribute])
  return elements
}

export const HtmlProfile = {
  parse(input: unknown): HtmlProfile {
    return schema.parse(input)
  },
}
