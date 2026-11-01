import { z } from 'zod'
import { type Motif, Page, type Page as PageValue, sheetMm } from './index.ts'

export const COVER_SHEET = { width: 160, height: 100 } as const

// This rises when the way a cover is drawn changes, so kept pictures get a new immutable address.
export const COVER_DRAWING_VERSION = 1

const COVER_PRINT = {
  paper: { width: COVER_SHEET.width, height: COVER_SHEET.height, unit: 'mm' as const },
  orientation: 'landscape' as const,
}

const CoverShape = z.object({
  page: z.lazy(() => Page),
  id: z.string().optional(),
  name: z.string().optional(),
})

export const Cover = CoverShape.transform((cover) => ({
  ...cover,
  page: cover.page.print ? cover.page : Page.parse({ ...cover.page, print: COVER_PRINT }),
})).superRefine((cover, ctx) => {
  const print = cover.page.print
  if (!print) return
  const sheet = sheetMm(print)
  if (sheet.width !== COVER_SHEET.width || sheet.height !== COVER_SHEET.height) {
    ctx.addIssue({
      code: 'custom',
      path: ['page', 'print', 'paper'],
      message: `page.print describes a ${sheet.width} × ${sheet.height} mm sheet; use the ${COVER_SHEET.width} × ${COVER_SHEET.height} mm cover sheet`,
    })
  }
  if (print.bleed !== 0) {
    ctx.addIssue({ code: 'custom', path: ['page', 'print', 'bleed'], message: 'page.print.bleed must be 0; remove bleed from the cover' })
  }
  if (print.safe !== 0) {
    ctx.addIssue({ code: 'custom', path: ['page', 'print', 'safe'], message: 'page.print.safe must be 0; remove the safe area from the cover' })
  }
  if (print.marks) {
    ctx.addIssue({ code: 'custom', path: ['page', 'print', 'marks'], message: 'page.print.marks must be false; remove marks from the cover' })
  }
  if (cover.page.scripts !== 'refuse') {
    ctx.addIssue({ code: 'custom', path: ['page', 'scripts'], message: "page.scripts must be 'refuse'; refuse scripts on the cover" })
  }
})
export type Cover = z.infer<typeof Cover>
export type CoverInput = z.input<typeof Cover>

export interface CoverDigestMaterial {
  page: PageValue
  sheet: { width: number; height: number }
  drawingVersion: number
  stamp: string
  fonts: readonly string[]
  motifs: readonly Motif[]
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined).map(canonicalValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  )
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

function orderedMotifs(motifs: readonly Motif[]): Motif[] {
  return [...motifs].sort(
    (left, right) => compareText(left.key, right.key) || compareText(left.revision, right.revision) || compareText(canonicalJson(left), canonicalJson(right)),
  )
}

export async function digestCoverMaterial(material: CoverDigestMaterial): Promise<string> {
  const { id: _pageId, ...page } = material.page
  const canonical = canonicalJson({
    ...material,
    page,
    fonts: [...material.fonts].sort(),
    motifs: orderedMotifs(material.motifs),
  })
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function coverDigest(cover: Cover, inputs: { stamp: string; fonts?: readonly string[]; motifs?: readonly Motif[] }): Promise<string> {
  return digestCoverMaterial({
    page: cover.page,
    sheet: sheetMm(cover.page.print as NonNullable<PageValue['print']>),
    drawingVersion: COVER_DRAWING_VERSION,
    stamp: inputs.stamp,
    fonts: inputs.fonts ?? [],
    motifs: inputs.motifs ?? [],
  })
}
