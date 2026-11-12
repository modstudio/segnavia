import { RenderRefusedError } from './errors.ts'

export type WatermarkPosition = 'start' | 'center' | 'end'

export interface Watermark {
  text?: string
  image?: string
  lang?: string
  dir?: 'ltr' | 'rtl' | 'auto'
  font?: string
  color?: string
  opacity?: number
  rotation?: number | 'diagonal'
  size?: number
  position?: { inline?: WatermarkPosition; block?: WatermarkPosition }
  pages?: 'all' | number[]
}

const POSITIONS = new Set<WatermarkPosition>(['start', 'center', 'end'])

function refusal(field: string, need: string): never {
  throw new RenderRefusedError(`The watermark ${field} ${need}; change watermark.${field} or omit the watermark to clear this refusal.`)
}

function parsePosition(value: unknown): Watermark['position'] {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) refusal('position', 'needs to be an object')
  const position = value as Record<string, unknown>
  for (const axis of ['inline', 'block'] as const) {
    if (position[axis] !== undefined && !POSITIONS.has(position[axis] as WatermarkPosition)) {
      refusal(`position.${axis}`, 'needs to be start, center or end')
    }
  }
  return {
    ...(position.inline === undefined ? {} : { inline: position.inline as WatermarkPosition }),
    ...(position.block === undefined ? {} : { block: position.block as WatermarkPosition }),
  }
}

function parsePages(value: unknown): Watermark['pages'] {
  if (value === undefined || value === 'all') return value
  if (!Array.isArray(value)) refusal('pages', 'needs to be all or an array of physical page numbers')
  if (value.some((page) => typeof page !== 'number' || !Number.isInteger(page) || page < 1)) {
    refusal('pages', 'needs only integer physical page numbers of 1 or more')
  }
  return [...value] as number[]
}

function validateStrings(input: Record<string, unknown>): void {
  for (const field of ['lang', 'font', 'color'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') refusal(field, 'needs to be a string')
  }
}

function validateNumbers(input: Record<string, unknown>): void {
  for (const field of ['opacity', 'size'] as const) {
    const number = input[field]
    if (number !== undefined && (typeof number !== 'number' || !Number.isFinite(number) || number <= 0 || number > 1)) {
      refusal(field, 'needs to be greater than 0 and no greater than 1')
    }
  }
  if (input.rotation !== undefined && input.rotation !== 'diagonal' && (typeof input.rotation !== 'number' || !Number.isFinite(input.rotation))) {
    refusal('rotation', 'needs to be a finite number of degrees or diagonal')
  }
}

export function parseWatermark(value: unknown): Watermark | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) refusal('option', 'needs to be an object')
  const input = value as Record<string, unknown>
  const hasText = input.text !== undefined
  const hasImage = input.image !== undefined
  if (hasText === hasImage) {
    throw new RenderRefusedError(
      'The watermark needs exactly one of text or image; pass one and remove the other, or omit the watermark, to clear this refusal.',
    )
  }
  const content = hasText ? input.text : input.image
  if (typeof content !== 'string') refusal(hasText ? 'text' : 'image', 'needs to be a string')
  validateStrings(input)
  if (input.dir !== undefined && input.dir !== 'ltr' && input.dir !== 'rtl' && input.dir !== 'auto') {
    refusal('dir', 'needs to be ltr, rtl or auto')
  }
  validateNumbers(input)
  return { ...input, position: parsePosition(input.position), pages: parsePages(input.pages) } as Watermark
}

export function watermarkPageNumbers(watermark: Watermark, count: number): number[] {
  const pages = watermark.pages ?? 'all'
  if (pages === 'all') return Array.from({ length: count }, (_, index) => index + 1)
  const beyond = pages.find((page) => page > count)
  if (beyond !== undefined) {
    throw new RenderRefusedError(
      `The watermark selects physical page ${beyond}, but the laid-out output has ${count} pages; select a page from 1 through ${count} to clear this refusal.`,
    )
  }
  return [...new Set(pages)]
}
