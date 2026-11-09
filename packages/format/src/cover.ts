import { z } from 'zod'
import { DocumentField } from './document.ts'
import { pageFromDocument } from './document-lowering.ts'
import type { Motif } from './motif.ts'
import type { Page as PageValue } from './page.ts'
import { sheetMm } from './paper.ts'
import { Print } from './print.ts'

export const COVER_SHEET = { width: 160, height: 100 } as const

// This rises when the way a cover is drawn changes, so kept pictures get a new immutable address.
export const COVER_DRAWING_VERSION = 1

const COVER_PRINT = {
  paper: { width: COVER_SHEET.width, height: COVER_SHEET.height, unit: 'mm' as const },
  orientation: 'landscape' as const,
}

const CoverPage = DocumentField.superRefine((document, ctx) => {
  if (document.brand !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['brand'],
      message: `cover page brand ${JSON.stringify(document.brand)} is not supported; remove the brand from the cover page`,
    })
  }
})
  .transform((document) => pageFromDocument(document))
  .superRefine((page, ctx) => {
    if (!('html' in page.body)) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message:
          'a cover page body must be stored HTML in body.html; pass the Document through @segnavia/html parseDocument first, or give the page an html body, to clear this refusal',
      })
    }
  })

const CoverShape = z.object({
  page: CoverPage,
  id: z.string().optional(),
  name: z.string().optional(),
})

export const Cover = CoverShape.transform((cover) => ({
  ...cover,
  page: { ...cover.page, print: cover.page.print ?? Print.parse(COVER_PRINT) },
})).superRefine((cover, ctx) => {
  const print = cover.page.print
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

export interface CoverDigestOptions {
  stamp: string
  fonts?: readonly string[]
  motifs?: readonly Motif[]
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

export function coverDigestMaterial(cover: Cover, options: CoverDigestOptions): CoverDigestMaterial {
  return {
    page: cover.page,
    sheet: sheetMm(cover.page.print),
    drawingVersion: COVER_DRAWING_VERSION,
    stamp: options.stamp,
    fonts: options.fonts ?? [],
    motifs: options.motifs ?? [],
  }
}

export async function coverDigest(cover: CoverInput, options: CoverDigestOptions): Promise<string> {
  return digestCoverMaterial(coverDigestMaterial(Cover.parse(cover), options))
}
