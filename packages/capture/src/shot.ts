// Takes one shot: lets the page settle, measures each annotation's element,
// and writes a clean image beside the measured geometry, so a viewer can show
// each annotation when its cue arrives. Asked for, it also writes an annotated
// rendition with every annotation drawn in, for pages that embed a still.

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { type Annotation, SHOT_KEY, type Shot, type TextDirection } from '@segnavia/format'
import { annotationSvg } from '@segnavia/frame/svg'
import { captureImage } from '@segnavia/render'
import type { Locator, Page } from 'playwright-core'
import { type AnnotationSpec, layoutAnnotation } from './geometry.ts'

export type Target = (
  | { role: Parameters<Page['getByRole']>[0]; name?: string | RegExp }
  | { label: string | RegExp }
  | { text: string | RegExp }
  | { css: string }
) & { exact?: boolean; within?: Target }

export interface ShotSpec {
  key: string
  title: string
  description?: string
  tags?: string[]
  annotate?: Array<AnnotationSpec & { target: Target }>
  // Extra wait before capture, for a screen with a slow transition.
  settleMs?: number
  meta?: Record<string, unknown>
}

export interface ImageOutput {
  format: 'png' | 'webp' | 'jpeg'
  // Tried in order until the image fits maxBytes.
  quality?: number[]
  maxBytes?: number
  // Also write the annotated rendition.
  annotated?: boolean
  color?: string
}

export function describeTarget(target: Target): string {
  const scope = target.within ? `${describeTarget(target.within)}.` : ''
  if ('role' in target) return `${scope}getByRole(${JSON.stringify(target.role)}${target.name === undefined ? '' : `, { name: ${String(target.name)} }`})`
  if ('label' in target) return `${scope}getByLabel(${String(target.label)})`
  if ('text' in target) return `${scope}getByText(${String(target.text)})`
  return `${scope}locator(${JSON.stringify(target.css)})`
}

// Role and accessible name first, as flows are best written; label, text and
// css exist for what an app leaves unnamed.
export function locate(page: Page, target: Target): Locator {
  const root: Page | Locator = target.within ? locate(page, target.within) : page
  const exact = target.exact ?? true
  if ('role' in target) return root.getByRole(target.role, target.name === undefined ? {} : { name: target.name, exact })
  if ('label' in target) return root.getByLabel(target.label, { exact })
  if ('text' in target) return root.getByText(target.text, { exact })
  return root.locator(target.css)
}

// Exactly one visible match, or the flow fails naming the step and target: a
// missing element means the screen changed, an ambiguous one means the
// annotation could land on the wrong thing. Either way a person must look.
export async function resolveOne(page: Page, target: Target, step: string): Promise<Locator> {
  const locator = locate(page, target).filter({ visible: true })
  const count = await locator.count()
  if (count !== 1) throw new Error(`Step "${step}": ${describeTarget(target)} matched ${count} visible elements; expected exactly one.`)
  return locator
}

// Waits for what makes a shot wrong if taken early: a lingering hover, web
// fonts, pending requests and images, then a moment for transitions.
export async function settle(page: Page, ms = 400): Promise<void> {
  const viewport = page.viewportSize()
  if (viewport) await page.mouse.move(viewport.width - 1, viewport.height - 1)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready.then(() => true))
  await page.waitForFunction(() => [...document.images].every((image) => image.complete), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(ms)
}

async function measure(page: Page, spec: ShotSpec, step: string, direction: TextDirection): Promise<Annotation[]> {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error(`Step "${step}": the page has no fixed viewport to measure against.`)
  const annotations: Annotation[] = []
  for (const [index, annotation] of (spec.annotate ?? []).entries()) {
    const locator = await resolveOne(page, annotation.target, step)
    if (index === 0) await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    const inside = box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1
    if (!box || !inside)
      throw new Error(`Step "${step}": ${describeTarget(annotation.target)} is not fully inside the ${viewport.width}x${viewport.height} viewport.`)
    try {
      annotations.push(layoutAnnotation(box, annotation, viewport, direction))
    } catch (error) {
      throw new Error(`Step "${step}": ${(error as Error).message}`)
    }
  }
  return annotations
}

const OVERLAY_ID = '__segnavia-annotations'

function drawOverlay({ id, svg }: { id: string; svg: string }) {
  const overlay = document.createElement('div')
  overlay.id = id
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none'
  overlay.innerHTML = svg
  for (const group of overlay.querySelectorAll('g')) group.setAttribute('style', 'opacity:1')
  document.documentElement.appendChild(overlay)
}

function removeOverlay(id: string) {
  document.getElementById(id)?.remove()
}

export async function takeShot(page: Page, spec: ShotSpec, options: { step: string; directory: string; scale: number; output: ImageOutput }): Promise<Shot> {
  if (!SHOT_KEY.test(spec.key)) throw new Error(`Shot key "${spec.key}" must be lowercase words joined by dots or dashes.`)
  if (!spec.title) throw new Error(`Shot ${spec.key} needs a title.`)
  await settle(page, spec.settleMs)
  const direction: TextDirection = await page.evaluate(() => (getComputedStyle(document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr'))
  const annotations = await measure(page, spec, options.step, direction)
  const viewport = page.viewportSize() as { width: number; height: number }
  const extension = options.output.format === 'jpeg' ? 'jpg' : options.output.format
  const encode = () =>
    captureImage(page, { format: options.output.format, quality: options.output.quality, limits: { maxBytes: options.output.maxBytes } }, false)
  const file = `${spec.key}.${extension}`
  writeFileSync(path.join(options.directory, file), await encode())
  let annotatedFile: string | null = null
  if (options.output.annotated && annotations.length > 0) {
    annotatedFile = `${spec.key}.annotated.${extension}`
    await page.evaluate(drawOverlay, { id: OVERLAY_ID, svg: annotationSvg(viewport, annotations, options.output.color) })
    try {
      writeFileSync(path.join(options.directory, annotatedFile), await encode())
    } finally {
      // A page that navigated or crashed has no overlay left to remove, and
      // the capture's own error is the one worth reporting.
      await page.evaluate(removeOverlay, OVERLAY_ID).catch(() => {})
    }
  }
  return {
    key: spec.key,
    title: spec.title,
    description: spec.description ?? null,
    tags: spec.tags ?? [],
    file,
    annotatedFile,
    size: viewport,
    scale: options.scale,
    dir: direction,
    annotations,
    capturedAt: new Date().toISOString(),
    meta: spec.meta ?? {},
  }
}
