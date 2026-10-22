import type { PressReport, Renderer } from '@segnavia/render'
import { readProfile } from '../../packages/render/src/color/profile.ts'
import { processRgbResidues } from './gray-residue.ts'
import type { Raster } from './pdf-raster.ts'

type Check = (what: string, ok: boolean, detail?: string) => void
type Stats = { max: number; mean: number }

// Poppler's fixed DeviceCMYK inks measured mean/max 6.28/29 with FOGRA39L and 9.83/53 with Generic CMYK; bounds 12/64 leave a 20% runtime margin.
const proofBounds = { max: 64, mean: 12 }

export async function verifyConvertedPressImages(
  renderer: Renderer,
  page: Parameters<Renderer['pagePdf']>[0],
  profile: Uint8Array,
  original: Raster,
  renderRaster: (name: string, bytes: Uint8Array) => Raster,
  proofStats: (original: Raster, converted: Raster, press: ReturnType<typeof readProfile>) => Stats,
  check: Check,
): Promise<void> {
  let report: PressReport | undefined
  const converted = await renderer.pagePdf(page, {
    waitForPageReady: true,
    press: { profile, images: 'convert', report: (value) => (report = value) },
  })
  const residues = await processRgbResidues(converted)
  const stats = proofStats(original, renderRaster('press-images-converted', converted), readProfile(profile))
  check(
    'press image conversion leaves no RGB and matches the engine proof on the image tile',
    report?.images.length === 0 &&
      report.convertedImages >= 2 &&
      residues.found.length === 0 &&
      residues.errors.length === 0 &&
      stats.mean <= proofBounds.mean &&
      stats.max <= proofBounds.max,
    `report=${JSON.stringify(report)} residues=${residues.found.join(',') || 'none'} proof mean=${stats.mean.toFixed(2)} max=${stats.max}`,
  )
}
