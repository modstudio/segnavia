import { z } from 'zod'
import { ImageFit } from './deck.ts'
import { MEDIA_FORMATS, type Media, MediaText, PAGE_BOXES, PageBoxName, PageSelector } from './media.ts'
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

type CropSide = 'top' | 'right' | 'bottom' | 'left'

function addCropAxisIssue(crop: Partial<Record<CropSide, string>>, first: CropSide, second: CropSide, ctx: z.RefinementCtx): void {
  const one = percentage(crop[first])
  const two = percentage(crop[second])
  const overfull = one !== undefined && one > 100 ? first : two !== undefined && two > 100 ? second : undefined
  if (overfull !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: [overfull],
      message: `${overfull} crop percentage must be at most 100%; lower it to clear this refusal`,
    })
    return
  }
  if ((one ?? 0) + (two ?? 0) < 100) return
  const percentageEdges = [one === undefined ? undefined : first, two === undefined ? undefined : second].filter((edge): edge is CropSide => edge !== undefined)
  const subject = percentageEdges.join(' and ')
  ctx.addIssue({
    code: 'custom',
    path: [first],
    message:
      percentageEdges.length === 1
        ? `${subject} crop percentage leaves no area; lower ${subject} below 100% to clear this refusal`
        : `${subject} crop percentages leave no area; lower either edge so their sum is below 100% to clear this refusal`,
  })
}

export const PlacementCrop = z
  .object({ top: CropEdge.optional(), right: CropEdge.optional(), bottom: CropEdge.optional(), left: CropEdge.optional() })
  .superRefine((crop, ctx) => {
    for (const [first, second] of [
      ['top', 'bottom'],
      ['left', 'right'],
    ] as const) {
      addCropAxisIssue(crop, first, second, ctx)
    }
  })
export type PlacementCrop = z.infer<typeof PlacementCrop>

export const PlacementShape = z.object({
  kind: AssetKind,
  address: z.string().min(1),
  page: PageSelector.optional(),
  box: PageBoxName.optional(),
  crop: PlacementCrop.optional(),
  fit: ImageFit.optional(),
  alt: MediaText.optional(),
})

export type Placement = z.infer<typeof PlacementShape>
export type PlacementInput = z.input<typeof PlacementShape>

const FIELD_REMEDIES: Record<keyof Placement, string> = {
  kind: `pass one of ${AssetKind.options.join(', ')}`,
  address: 'pass a non-empty address',
  page: 'pass a positive page number or a non-empty page name',
  box: `pass one of ${PAGE_BOXES.join(', ')}`,
  crop: 'pass non-negative crop edges using supported CSS units',
  fit: 'pass contain, cover, width or focus',
  alt: 'pass non-empty alt text with an optional language and direction',
}

function shapeRefusal(error: z.ZodError): PlacementRefusedError {
  const issue = error.issues[0]
  const field = String(issue?.path[0] ?? 'kind') as keyof Placement
  const detail = issue?.message ?? 'the value is invalid'
  // This module's refinements state their own remedy; Zod's built-in issues do not.
  if (issue?.code === 'custom') return new PlacementRefusedError(`${field} could not be accepted: ${detail}`)
  return new PlacementRefusedError(`${field} could not be accepted: ${detail}; ${FIELD_REMEDIES[field]} to clear this refusal`)
}

const PLACEMENT_SETTING_NEEDS = {
  page: 'pages',
  box: 'pages',
  crop: 'media',
} as const satisfies Record<'page' | 'box' | 'crop', 'media' | 'pages'>

function parsePlacement(input: PlacementInput, container: PlacementContainer, placed?: Media): Placement {
  const parsed = PlacementShape.safeParse(input)
  if (!parsed.success) throw shapeRefusal(parsed.error)
  const placement = parsed.data
  const accepted: readonly AssetKind[] = PLACEMENT_ACCEPTS[container]
  if (accepted === undefined) {
    throw new PlacementRefusedError(
      `container could not be accepted: ${container}; place into one of ${Object.keys(PLACEMENT_ACCEPTS).join(', ')} to clear this refusal`,
    )
  }
  if (!accepted.includes(placement.kind)) {
    throw new PlacementRefusedError(
      `kind could not be accepted: ${container} does not accept ${placement.kind}; place one of ${accepted.join(', ')} to clear this refusal`,
    )
  }
  for (const field of Object.keys(PLACEMENT_SETTING_NEEDS) as (keyof typeof PLACEMENT_SETTING_NEEDS)[]) {
    const need = PLACEMENT_SETTING_NEEDS[field]
    if (placement[field] !== undefined && placement.kind !== 'media') {
      throw new PlacementRefusedError(`${field} could not be accepted on ${placement.kind}; remove ${field} or place media to clear this refusal`)
    }
    if (placement[field] !== undefined && need === 'pages' && placed && !MEDIA_FORMATS[placed.format].pages) {
      throw new PlacementRefusedError(
        `${field} could not be accepted for ${placed.format} media; remove ${field} or place media with pages to clear this refusal`,
      )
    }
  }
  return placement
}

export const Placement = { parse: parsePlacement }
