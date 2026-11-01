import type { Page } from '@segnavia/format'
import { printViewport } from './page-paper.ts'

export const FLUID_WIDTH = 1024

export interface PageViewport {
  width: number
  height: number
  grows: boolean
}

export function pageViewport(page: Page, width?: number): PageViewport {
  if (page.print) return { ...printViewport(page.print), grows: false }
  if (page.size === 'fluid') return { width: width ?? FLUID_WIDTH, height: 800, grows: true }
  return { width: page.size.width, height: page.size.height === 'auto' ? 800 : page.size.height, grows: page.size.height === 'auto' }
}
