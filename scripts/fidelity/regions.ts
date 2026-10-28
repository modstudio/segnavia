import type { Locator } from 'playwright-core'
import type { Box } from './types.ts'

export interface ComputedStyleFacts {
  box: Box
  backgroundImage: string
  borderImage: string
  opacity: string
  mixBlendMode: string
  filter: string
  backdropFilter: string
  boxShadow: string
  textShadow: string
  mask: string
  maskImage: string
}

function splitLayers(value: string): string[] {
  const layers: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '(') depth++
    if (value[index] === ')') depth--
    if (value[index] === ',' && depth === 0) {
      layers.push(value.slice(start, index))
      start = index + 1
    }
  }
  layers.push(value.slice(start))
  return layers
}

function shadowGrowth(value: string): { left: number; top: number; right: number; bottom: number } {
  const growth = { left: 0, top: 0, right: 0, bottom: 0 }
  if (!value || value === 'none') return growth
  for (const layer of splitLayers(value)) {
    const withoutColors = layer.replace(/[a-z-]+\([^)]*\)|#[\da-f]+|\b(?:transparent|currentcolor|[a-z]+)\b/gi, ' ')
    const lengths = [...withoutColors.matchAll(/(-?(?:\d+\.?\d*|\.\d+))px/g)].map((match) => Number(match[1]))
    const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = lengths
    const radius = Math.max(0, blur) + spread
    growth.left = Math.max(growth.left, radius - offsetX)
    growth.top = Math.max(growth.top, radius - offsetY)
    growth.right = Math.max(growth.right, radius + offsetX)
    growth.bottom = Math.max(growth.bottom, radius + offsetY)
  }
  return growth
}

const present = (value: string): boolean => Boolean(value && value !== 'none')
const masked = (value: string): boolean => Boolean(value && !/^none(?:\s|$)/.test(value))

export function blendedRegionBoxes(facts: ComputedStyleFacts[]): Box[] {
  return facts.flatMap((style) => {
    const blended =
      style.backgroundImage.includes('gradient(') ||
      style.borderImage.includes('gradient(') ||
      Number(style.opacity) < 1 ||
      (style.mixBlendMode !== 'normal' && style.mixBlendMode !== '') ||
      present(style.filter) ||
      present(style.backdropFilter) ||
      present(style.boxShadow) ||
      present(style.textShadow) ||
      masked(style.mask) ||
      masked(style.maskImage)
    if (!blended) return []
    const boxShadow = shadowGrowth(style.boxShadow)
    const textShadow = shadowGrowth(style.textShadow)
    const growth = {
      left: Math.max(boxShadow.left, textShadow.left),
      top: Math.max(boxShadow.top, textShadow.top),
      right: Math.max(boxShadow.right, textShadow.right),
      bottom: Math.max(boxShadow.bottom, textShadow.bottom),
    }
    return [
      {
        x: style.box.x - growth.left,
        y: style.box.y - growth.top,
        width: style.box.width + growth.left + growth.right,
        height: style.box.height + growth.top + growth.bottom,
      },
    ]
  })
}

export async function computedStyleFacts(root: Locator): Promise<ComputedStyleFacts[]> {
  return root.locator('xpath=descendant-or-self::*').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
        backgroundImage: style.backgroundImage,
        borderImage: style.borderImage,
        opacity: style.opacity,
        mixBlendMode: style.mixBlendMode,
        filter: style.filter,
        backdropFilter: style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter'),
        boxShadow: style.boxShadow,
        textShadow: style.textShadow,
        mask: style.getPropertyValue('mask') || style.getPropertyValue('-webkit-mask'),
        maskImage: style.getPropertyValue('mask-image') || style.getPropertyValue('-webkit-mask-image'),
      }
    }),
  )
}

export async function fidelityRegions(root: Locator): Promise<Array<{ name: string; box: Box }>> {
  return root.locator('[data-fidelity]').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return {
        name: element.getAttribute('data-fidelity') ?? 'unnamed',
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
      }
    }),
  )
}

export function regionMask(boxes: Box[], width: number, height: number, scale: number): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x * scale))
    const y0 = Math.max(0, Math.floor(box.y * scale))
    const x1 = Math.min(width, Math.ceil((box.x + box.width) * scale))
    const y1 = Math.min(height, Math.ceil((box.y + box.height) * scale))
    for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1)
  }
  return mask
}

export function offsetBoxes(items: Array<{ box: Box }>, x: number, y: number): void {
  for (const item of items) {
    item.box.x -= x
    item.box.y -= y
  }
}
