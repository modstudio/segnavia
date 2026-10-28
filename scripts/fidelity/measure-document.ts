import { unlink } from 'node:fs/promises'
import path from 'node:path'
import type { PageInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import type { Page as Tab } from 'playwright-core'
import type { Profile, ProofTable } from '../../packages/render/src/color/index.ts'
import { processColorResidues } from '../verify/gray-residue.ts'
import { measureBars } from './bars.ts'
import { compareReaders } from './compare-readers.ts'
import { EFFECTLESS_CSS, MEASUREMENT_CSS, SCALE } from './config.ts'
import { difference, imageSize, modelPressRaster, proofImage, writeMask } from './image.ts'
import { analyzePdf, trimPdf } from './pdf.ts'
import { type PressRasterizer, pressGhostscript, pressPoppler } from './readers.ts'
import { blendedRegionBoxes, type ComputedStyleFacts, regionMask } from './regions.ts'
import type { Box, Difference, DocumentResult, SizeMeasurement } from './types.ts'

export interface FidelitySession {
  renderer: Renderer
  executablePath: string
  profilePath?: string
  profileBytes?: Uint8Array
  profile?: Profile
  table?: ProofTable
  grayProfilePath?: string
  grayProfileBytes?: Uint8Array
  grayTable?: ProofTable
  selectedPressRasterizer: PressRasterizer
  defaultGrayProfile: string
}

export async function prepareEffectless(tab: Tab): Promise<void> {
  await tab.evaluate((effectlessCss) => {
    const firstColor = (paint: string): string | undefined => paint.match(/rgba?\([^)]*\)/)?.[0]
    const flattenBackground = (element: HTMLElement, pseudo?: '::before' | '::after'): void => {
      const paint = getComputedStyle(element, pseudo).backgroundImage
      if (!paint.includes('gradient(')) return
      element.classList.add(pseudo === '::before' ? 'fidelity-flat-before' : pseudo === '::after' ? 'fidelity-flat-after' : 'fidelity-flat-gradient')
      element.style.setProperty('--fidelity-flat-color', firstColor(paint) ?? 'transparent')
    }
    const gradientColor = (paint: string): string => {
      const id = paint.match(/url\(["']?#([^"')]+)["']?\)/)?.[1]
      const stop = id ? document.querySelector(`#${CSS.escape(id)} stop`) : undefined
      return stop ? getComputedStyle(stop).stopColor : '#000'
    }
    const flattenSvgPaint = (element: SVGElement, property: 'fill' | 'stroke', className: string): void => {
      const paint = getComputedStyle(element)[property]
      if (!paint.startsWith('url(')) return
      element.classList.add(className)
      element.style.setProperty(`--fidelity-flat-${property}`, gradientColor(paint))
    }
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      flattenBackground(element)
      flattenBackground(element, '::before')
      flattenBackground(element, '::after')
      if (element instanceof SVGElement) {
        flattenSvgPaint(element, 'fill', 'fidelity-flat-fill')
        flattenSvgPaint(element, 'stroke', 'fidelity-flat-stroke')
      }
    }
    const style = document.createElement('style')
    style.textContent = effectlessCss
    document.head.append(style)
  }, EFFECTLESS_CSS)
}

export interface FinishDocumentInput {
  id: string
  title: string
  kind: DocumentResult['kind']
  directory: string
  screen: string
  pdf: string
  pdfBytes: number
  effectlessPdf: string
  effectlessPdfBytes: number
  comparisonPdf: string
  comparisonBox: DocumentResult['comparisonBox']
  regions: Array<{ name: string; box: Box }>
  blendedFacts: ComputedStyleFacts[]
  rasterEffects?: number
  expectedMarker: number
  size: SizeMeasurement
  session: FidelitySession
  page?: PageInput
  pressCss?: string
  pressFiles?: {
    pressPdf?: string
    pressComparisonPdf?: string
    grayPressPdf?: string
    grayPressComparisonPdf?: string
    grayPressPdfBytes?: Uint8Array
    pressReason?: string
    grayPressReason?: string
  }
  bookId?: string
  pageIndex?: number
  faultControl?: boolean
  textWindow?: Box
}

interface PressMeasure {
  pressPdf?: string
  pressProof?: string
  pressRaster?: string
  pressDifference?: Difference
  pressReason?: string
}

async function rasterizeCmykPress(
  pressPdf: string,
  pressComparisonPdf: string,
  directory: string,
  screen: string,
  width: number,
  height: number,
  session: FidelitySession,
): Promise<PressMeasure> {
  const { profilePath, profileBytes, profile, table, selectedPressRasterizer } = session
  if (!profilePath || !profileBytes || !profile || !table) return { pressReason: 'SEGNAVIA_FIDELITY_PROFILE was not set.' }
  const pressProof = path.join(directory, 'screen-proof.png')
  const pressRaster = path.join(directory, 'press.png')
  try {
    proofImage(screen, pressProof, width, height, table, profile)
    if (selectedPressRasterizer === 'ghostscript') {
      const deviceRaster = `${pressRaster}.device.tiff`
      try {
        const rendered = await pressGhostscript(pressComparisonPdf, deviceRaster, width, height, profilePath, 'cmyk')
        if (!rendered.worked) return { pressPdf, pressProof, pressRaster, pressReason: rendered.error ?? 'Ghostscript did not render the press PDF.' }
        await modelPressRaster(deviceRaster, pressRaster, width, height, profile)
        return { pressPdf, pressProof, pressRaster, pressDifference: difference(pressProof, pressRaster, width, height) }
      } finally {
        await unlink(deviceRaster).catch(() => {})
      }
    }
    const rendered = await pressPoppler(pressComparisonPdf, pressRaster, width, height, profilePath, 'cmyk')
    if (!rendered.worked) return { pressPdf, pressProof, pressRaster, pressReason: rendered.error ?? 'Poppler did not render the press PDF.' }
    return { pressPdf, pressProof, pressRaster, pressDifference: difference(pressProof, pressRaster, width, height) }
  } catch (error) {
    return { pressReason: error instanceof Error ? error.message : String(error) }
  }
}

interface GrayMeasure {
  grayPressPdf?: string
  grayPressProof?: string
  grayPressRaster?: string
  grayPressDifference?: Difference
  grayPressResidues?: number
  grayPressResidueErrors?: string[]
  grayPressReason?: string
}

async function rasterizeGrayPress(
  grayPressPdf: string,
  grayPressComparisonPdf: string,
  grayPressPdfBytes: Uint8Array,
  directory: string,
  screen: string,
  width: number,
  height: number,
  session: FidelitySession,
): Promise<GrayMeasure> {
  const { grayProfilePath, grayProfileBytes, grayTable } = session
  if (!grayProfilePath || !grayProfileBytes || !grayTable) {
    return { grayPressReason: `SEGNAVIA_FIDELITY_GRAY_PROFILE was not set and ${session.defaultGrayProfile} does not exist.` }
  }
  const grayPressProof = path.join(directory, 'screen-proof-gray.png')
  const grayPressRaster = path.join(directory, 'press-gray.png')
  try {
    const residues = await processColorResidues(grayPressPdfBytes)
    proofImage(screen, grayPressProof, width, height, grayTable)
    const rendered = await pressPoppler(grayPressComparisonPdf, grayPressRaster, width, height, grayProfilePath, 'gray')
    if (!rendered.worked) {
      return {
        grayPressPdf,
        grayPressProof,
        grayPressRaster,
        grayPressResidues: residues.found.length,
        grayPressResidueErrors: residues.errors,
        grayPressReason: rendered.error ?? 'Poppler did not render the gray press PDF.',
      }
    }
    return {
      grayPressPdf,
      grayPressProof,
      grayPressRaster,
      grayPressDifference: difference(grayPressProof, grayPressRaster, width, height),
      grayPressResidues: residues.found.length,
      grayPressResidueErrors: residues.errors,
    }
  } catch (error) {
    return { grayPressReason: error instanceof Error ? error.message : String(error) }
  }
}

async function pressFromPage(
  page: PageInput,
  directory: string,
  id: string,
  css: string,
  screen: string,
  width: number,
  height: number,
  session: FidelitySession,
): Promise<{ cmyk: PressMeasure; gray: GrayMeasure }> {
  const { renderer, profilePath, profileBytes, profile, table, grayProfilePath, grayProfileBytes, grayTable } = session
  let cmyk: PressMeasure
  if (profilePath && profileBytes && profile && table) {
    const pressPdf = path.join(directory, `${id}-press.pdf`)
    const pressComparisonPdf = path.join(directory, 'press-comparison.pdf')
    try {
      await Bun.write(pressPdf, await renderer.pagesPdf([page], { css, press: { profile: profileBytes } }))
      await trimPdf(pressPdf, pressComparisonPdf)
      cmyk = await rasterizeCmykPress(pressPdf, pressComparisonPdf, directory, screen, width, height, session)
    } catch (error) {
      cmyk = { pressReason: error instanceof Error ? error.message : String(error) }
    }
  } else {
    cmyk = { pressReason: 'SEGNAVIA_FIDELITY_PROFILE was not set.' }
  }
  let gray: GrayMeasure
  if (grayProfilePath && grayProfileBytes && grayTable) {
    const grayPressPdf = path.join(directory, `${id}-press-gray.pdf`)
    const grayPressComparisonPdf = path.join(directory, 'press-gray-comparison.pdf')
    try {
      const grayPdfBytes = await renderer.pagesPdf([page], { css, press: { profile: grayProfileBytes } })
      await Bun.write(grayPressPdf, grayPdfBytes)
      await trimPdf(grayPressPdf, grayPressComparisonPdf)
      gray = await rasterizeGrayPress(grayPressPdf, grayPressComparisonPdf, grayPdfBytes, directory, screen, width, height, session)
    } catch (error) {
      gray = { grayPressReason: error instanceof Error ? error.message : String(error) }
    }
  } else {
    gray = { grayPressReason: `SEGNAVIA_FIDELITY_GRAY_PROFILE was not set and ${session.defaultGrayProfile} does not exist.` }
  }
  return { cmyk, gray }
}

export async function finishDocument(input: FinishDocumentInput): Promise<DocumentResult> {
  const size = await imageSize(input.screen)
  const blendedMask = path.join(input.directory, 'blended-mask.png')
  const blendedMaskPixels = regionMask(blendedRegionBoxes(input.blendedFacts), size.width, size.height, SCALE)
  writeMask(blendedMaskPixels, blendedMask, size.width, size.height)
  const blendedFraction = blendedMaskPixels.reduce((count, value) => count + (value ? 1 : 0), 0) / blendedMaskPixels.length
  if (input.kind === 'book' && !input.textWindow) throw new Error(`${input.id} has no body text window.`)
  const readers = await compareReaders(
    input.screen,
    input.comparisonPdf,
    input.directory,
    size,
    input.regions,
    input.expectedMarker,
    input.session.executablePath,
    input.textWindow,
  )
  let cmyk: PressMeasure = { pressReason: input.pressFiles?.pressReason }
  let gray: GrayMeasure = { grayPressReason: input.pressFiles?.grayPressReason }
  if (input.pressFiles?.pressComparisonPdf && input.pressFiles.pressPdf && !input.pressFiles.pressReason) {
    cmyk = await rasterizeCmykPress(
      input.pressFiles.pressPdf,
      input.pressFiles.pressComparisonPdf,
      input.directory,
      input.screen,
      size.width,
      size.height,
      input.session,
    )
  } else if (input.page) {
    const measured = await pressFromPage(
      input.page,
      input.directory,
      input.id,
      input.pressCss ?? MEASUREMENT_CSS,
      input.screen,
      size.width,
      size.height,
      input.session,
    )
    cmyk = measured.cmyk
    gray = measured.gray
  } else if (!cmyk.pressReason) {
    cmyk = { pressReason: 'SEGNAVIA_FIDELITY_PROFILE was not set.' }
  }
  if (input.pressFiles?.grayPressComparisonPdf && input.pressFiles.grayPressPdf && input.pressFiles.grayPressPdfBytes && !input.pressFiles.grayPressReason) {
    gray = await rasterizeGrayPress(
      input.pressFiles.grayPressPdf,
      input.pressFiles.grayPressComparisonPdf,
      input.pressFiles.grayPressPdfBytes,
      input.directory,
      input.screen,
      size.width,
      size.height,
      input.session,
    )
  } else if (!input.page && !gray.grayPressReason) {
    gray = { grayPressReason: `SEGNAVIA_FIDELITY_GRAY_PROFILE was not set and ${input.session.defaultGrayProfile} does not exist.` }
  }
  const regionResults = readers.flatMap((reader) => reader.regions ?? [])
  const worstRegion = regionResults.reduce((worst, region) => ({ mean: Math.max(worst.mean, region.mean), p99: Math.max(worst.p99, region.p99) }), {
    mean: 0,
    p99: 0,
  })
  return {
    id: input.id,
    title: input.title,
    kind: input.kind,
    pdf: input.pdf,
    pdfBytes: input.pdfBytes,
    effectlessPdf: input.effectlessPdf,
    effectlessPdfBytes: input.effectlessPdfBytes,
    screen: input.screen,
    width: size.width,
    height: size.height,
    comparisonBox: input.comparisonBox,
    analysis: await analyzePdf(input.pdf),
    readers,
    pressPdf: cmyk.pressPdf,
    pressProof: cmyk.pressProof,
    pressRaster: cmyk.pressRaster,
    pressDifference: cmyk.pressDifference,
    pressReason: cmyk.pressReason,
    grayPressPdf: gray.grayPressPdf,
    grayPressProof: gray.grayPressProof,
    grayPressRaster: gray.grayPressRaster,
    grayPressDifference: gray.grayPressDifference,
    grayPressResidues: gray.grayPressResidues,
    grayPressResidueErrors: gray.grayPressResidueErrors,
    grayPressReason: gray.grayPressReason,
    blendedMask,
    blendedFraction,
    rasterEffects: input.rasterEffects,
    bars: measureBars({
      kind: input.kind,
      blendedFraction,
      readers,
      worstRegion,
      pressDifference: cmyk.pressDifference,
      pressReason: cmyk.pressReason,
      grayPressDifference: gray.grayPressDifference,
      grayPressResidues: gray.grayPressResidues,
      grayPressResidueErrors: gray.grayPressResidueErrors,
      grayPressReason: gray.grayPressReason,
      size: input.size,
    }),
    bookId: input.bookId,
    pageIndex: input.pageIndex,
    faultControl: input.faultControl,
  }
}
