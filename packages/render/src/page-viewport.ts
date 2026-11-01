import { FLUID_WIDTH, type Page } from '@segnavia/format'
import type { Page as Tab } from 'playwright-core'
import { printViewport } from './page-paper.ts'

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

export async function contentHeight(tab: Tab): Promise<number> {
  const width = tab.viewportSize()?.width ?? FLUID_WIDTH
  await tab.setViewportSize({ width, height: 1 })
  const height = await tab.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0))
  await tab.setViewportSize({ width, height })
  return height
}
