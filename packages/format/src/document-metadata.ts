import { z } from 'zod'
import { BookShape } from './book.ts'

const DEFINED_FIELDS = new Set(['title', 'authors', 'subject', 'lang'])

function inRanges(point: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => point >= start && point <= end)
}

const XML_NAME_START_RANGES: Array<[number, number]> = [
  [0x41, 0x5a],
  [0x5f, 0x5f],
  [0x61, 0x7a],
  [0xc0, 0xd6],
  [0xd8, 0xf6],
  [0xf8, 0x2ff],
  [0x370, 0x37d],
  [0x37f, 0x1fff],
  [0x200c, 0x200d],
  [0x2070, 0x218f],
  [0x2c00, 0x2fef],
  [0x3001, 0xd7ff],
  [0xf900, 0xfdcf],
  [0xfdf0, 0xfffd],
  [0x10000, 0xeffff],
]
const XML_NAME_CHAR_RANGES: Array<[number, number]> = [...XML_NAME_START_RANGES, [0x2d, 0x2e], [0x30, 0x39], [0xb7, 0xb7], [0x300, 0x36f], [0x203f, 0x2040]]

function validXmlLocalName(value: string): boolean {
  const points = Array.from(value, (character) => character.codePointAt(0) as number)
  const first = points[0]
  if (first === undefined || !inRanges(first, XML_NAME_START_RANGES)) return false
  return points.slice(1).every((point) => inRanges(point, XML_NAME_CHAR_RANGES))
}

export const DocumentMetadata = z
  .object({
    title: z.string().refine((title) => title.trim().length > 0, {
      message: 'title must contain visible text; give a title with visible text or omit the metadata',
    }),
    authors: z.array(z.string()).optional(),
    subject: z.string().optional(),
    lang: BookShape.shape.lang,
    extra: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((metadata, ctx) => {
    for (const key of Object.keys(metadata.extra ?? {})) {
      if (DEFINED_FIELDS.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['extra', key], message: `extra key "${key}" collides with the defined field "${key}"; remove it from extra` })
      } else if (!validXmlLocalName(key)) {
        ctx.addIssue({ code: 'custom', path: ['extra', key], message: `extra key "${key}" is not a valid XML local name; use a valid XML local name` })
      }
    }
  })

export type DocumentMetadata = z.infer<typeof DocumentMetadata>
