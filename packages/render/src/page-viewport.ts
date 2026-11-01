import type { Page } from '@segnavia/format'
import { printViewport } from './page-paper.ts'

export const FLUID_WIDTH = 1024

export function pageViewport(page: Page, width?: number): { width: number; height: number } {
  if (page.print) return printViewport(page.print)
  if (page.size === 'fluid') return { width: width ?? FLUID_WIDTH, height: 800 }
  return { width: page.size.width, height: page.size.height === 'auto' ? 800 : page.size.height }
}
