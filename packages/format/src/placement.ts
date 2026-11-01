import { z } from 'zod'
import { ImageFit } from './deck.ts'
import { MEDIA_FORMATS, type Media, MediaText, PageSelector } from './media.ts'
import { PlacementRefusedError } from './placement-refusal.ts'

export const PLACEMENT_ACCEPTS = {
  board: ['deck', 'page', 'paper', 'book', 'media', 'shot'],
  book: ['media', 'page'],
  page: ['media'],
  deck: ['media'],
  paper: ['media'],
} as const

export const AssetKind = z.enum(['deck', 'page', 'paper', 'book', 'media', 'shot'])
export type AssetKind = z.infer<typeof AssetKind>
export type PlacementContainer = keyof typeof PLACEMENT_ACCEPTS

const CROP_EDGE = /^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:%|px|pt|mm|cm|in))$/
export const CropEdge = z.string().regex(CROP_EDGE, 'crop edge must be 0 or a non-negative CSS length or percentage')
export type CropEdge = z.infer<typeof CropEdge>

function percentage(edge: string | undefined): number | undefined {
  return edge?.endsWith('%') ? Number(edge.slice(0, -1)) : undefined
}

export const PlacementCrop = z
  .object({ top: CropEdge.optional(), right: CropEdge.optional(), bottom: CropEdge.optional(), left: CropEdge.optional() })
  .superRefine((crop, ctx) => {
    for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
      const value = percentage(crop[edge])
      if (value !== undefined && value > 100) {
        ctx.addIssue({ code: 'custom', path: [edge], message: `${edge} crop percentage must be at most 100%; lower it to clear this refusal` })
      }
    }
    for (const [first, second] of [
      ['top', 'bottom'],
      ['left', 'right'],
    ] as const) {
      const one = percentage(crop[first])
      const two = percentage(crop[second])
      if (one !== undefined && two !== undefined && one + two >= 100) {
        ctx.addIssue({
          code: 'custom',
          path: [first],
          message: `${first} and ${second} crop percentages leave no area; lower either edge so their sum is below 100% to clear this refusal`,
        })
      }
    }
  })
export type PlacementCrop = z.infer<typeof PlacementCrop>

const PlacementShape = z.object({
  kind: AssetKind,
  address: z.string().min(1),
  page: PageSelector.optional(),
  box: z.enum(['media', 'crop', 'trim', 'bleed', 'art']).optional(),
  crop: PlacementCrop.optional(),
  fit: ImageFit.optional(),
  alt: MediaText.optional(),
})

export type Placement = z.infer<typeof PlacementShape>
export type PlacementInput = z.input<typeof PlacementShape>

const FIELD_REMEDIES: Record<string, string> = {
  kind: 'pass one of deck, page, paper, book, media or shot',
  address: 'pass a non-empty address',
  page: 'pass a positive page number or a non-empty page name',
  box: 'pass media, crop, trim, bleed or art',
  crop: 'pass non-negative crop edges using supported CSS units',
  fit: 'pass contain, cover, width or focus',
  alt: 'pass non-empty alt text with an optional language and direction',
}

function shapeRefusal(error: z.ZodError): PlacementRefusedError {
  const issue = error.issues[0]
  const field = String(issue?.path[0] ?? 'placement')
  const remedy = FIELD_REMEDIES[field] ?? 'pass a valid placement'
  return new PlacementRefusedError(`${field} could not be accepted: ${issue?.message ?? 'the value is invalid'}; ${remedy} to clear this refusal`)
}

function parsePlacement(input: PlacementInput, container: PlacementContainer, placed?: Media): Placement {
  const parsed = PlacementShape.safeParse(input)
  if (!parsed.success) throw shapeRefusal(parsed.error)
  const placement = parsed.data
  const accepted: readonly AssetKind[] = PLACEMENT_ACCEPTS[container]
  if (!accepted.includes(placement.kind)) {
    throw new PlacementRefusedError(
      `kind could not be accepted: ${container} does not accept ${placement.kind}; place one of ${accepted.join(', ')} to clear this refusal`,
    )
  }
  for (const field of ['page', 'box', 'crop'] as const) {
    if (placement[field] !== undefined && placement.kind !== 'media') {
      throw new PlacementRefusedError(`${field} could not be accepted on ${placement.kind}; remove ${field} or place media to clear this refusal`)
    }
  }
  if (placed && !MEDIA_FORMATS[placed.format].pages) {
    for (const field of ['page', 'box'] as const) {
      if (placement[field] !== undefined) {
        throw new PlacementRefusedError(
          `${field} could not be accepted for ${placed.format} media; remove ${field} or place media with pages to clear this refusal`,
        )
      }
    }
  }
  return placement
}

export const Placement = { parse: parsePlacement }
