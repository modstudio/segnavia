import { existsSync } from 'node:fs'
import path from 'node:path'
import type { PageInput } from '@segnavia/format'

export const ROOT = path.resolve(import.meta.dir, '../..')
export const OUTPUT_ROOT = path.resolve(process.env.SEGNAVIA_FIDELITY_OUT ?? path.join(ROOT, 'out/fidelity'))
export const SCALE = 4
// These acceptance limits are provisional until Shmuel agrees the numbers.
export const EFFECT_REGION_THRESHOLD = { mean: 2, p99: 24 }
export const PRESS_COLOR_THRESHOLD = { mean: 3, p99: 30 }
export const PDF_SIZE_THRESHOLD = { multiple: 3, absoluteBytes: 500_000 }
export const ALIGNMENT_TOLERANCE = 16

export const MEASUREMENT_CSS =
  'html{overflow:clip!important}html::after{content:"";position:fixed;left:16px;top:16px;width:12px;height:12px;box-sizing:border-box;background:rgb(1 254 2);border:3px solid rgb(254 1 253);z-index:2147483647;pointer-events:none}'

export const EFFECTLESS_CSS =
  '*,*::before,*::after{box-shadow:none!important;text-shadow:none!important;filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;mask-image:none!important;-webkit-mask-image:none!important}.fidelity-flat-gradient{background-image:none!important;background-color:var(--fidelity-flat-color)!important}.fidelity-flat-before::before,.fidelity-flat-after::after{background-image:none!important;background-color:var(--fidelity-flat-color)!important}.fidelity-flat-fill{fill:var(--fidelity-flat-fill)!important}.fidelity-flat-stroke{stroke:var(--fidelity-flat-stroke)!important}'

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
    fixed('hebrew', 'Hebrew editorial page', 900, 1100, { lang: 'he' }),
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
