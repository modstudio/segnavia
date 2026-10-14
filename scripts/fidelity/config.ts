import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PageInput } from '@segnavia/format'

export const ROOT = path.resolve(import.meta.dir, '../..')
export const OUTPUT_ROOT = path.join(ROOT, 'out/fidelity')
export const SCALE = 4
export const COMPARISON_IMAGE_THRESHOLD = { mean: 2, p99: 24 }
// These limits are provisional baseline values. They are kept together so a
// reviewed baseline changes each acceptance bar in exactly one place.
export const EFFECT_REGION_THRESHOLD = { mean: 8, p99: 160 }
export const PRESS_COLOR_THRESHOLD = { mean: 12, p99: 180 }
export const PDF_BYTES_THRESHOLD = 2_500_000
export const ALIGNMENT_TOLERANCE = 8

export const MEASUREMENT_CSS =
  'html{overflow:hidden!important}.fidelity-alignment-marker{position:fixed;width:12px;height:12px;box-sizing:border-box;background:rgb(1 254 2);border:3px solid rgb(254 1 253);z-index:2147483647;pointer-events:none}'

export interface Fixture {
  id: string
  title: string
  page: PageInput
}

const fixed = (id: string, title: string, width: number, height: number, extra: Partial<PageInput> = {}): Fixture => ({
  id,
  title,
  page: { html: '', size: { width, height }, ...extra },
})

export async function fixtures(): Promise<Fixture[]> {
  const entries = [
    fixed('flyer', 'Editorial flyer', 900, 1200),
    fixed('cards', 'Card collection', 1000, 800),
    fixed('glass-ui', 'Glass interface', 1100, 800),
    fixed('data-report', 'Data report', 1000, 750),
    fixed('poster', 'Event poster', 800, 1120),
    fixed('slide', 'Presentation slide', 1280, 720),
    fixed('print-piece', 'A5 postcard', 559, 794, {
      print: { paper: 'a5', orientation: 'portrait', bleed: 3, safe: 8, marks: false },
    }),
    fixed('hebrew', 'Hebrew editorial page', 900, 1100, { dir: 'rtl', lang: 'he' }),
  ]
  for (const entry of entries) entry.page.html = await Bun.file(path.join(ROOT, 'fixtures/fidelity', `${entry.id}.html`)).text()
  return entries
}

export function chromiumPath(): string {
  const candidates = [
    process.env.SEGNAVIA_CHROMIUM,
    '/Users/shmuel/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ]
  const found = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!found) throw new Error('No Chromium executable was found. Set SEGNAVIA_CHROMIUM.')
  return found
}
