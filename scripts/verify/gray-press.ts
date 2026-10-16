import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { PressReport, Renderer } from '@segnavia/render'
import { toGray } from '../../packages/render/src/color/engine.ts'
import { readProfile } from '../../packages/render/src/color/profile.ts'
import { buildGrayProfile } from '../../packages/render/src/color/profile-fixture.test-helper.ts'
import { inspectPressPdf } from '../../packages/render/src/press/adapter.ts'
import { visitContentOperators, visitContentTokens } from '../../packages/render/src/press/content.ts'
import { decodeContent, nameOf } from '../../packages/render/src/press/pdf-objects.ts'
import { walkPressGraph } from '../../packages/render/src/press/visitor.ts'

type Check = (what: string, ok: boolean, detail?: string) => void
const genericGrayProfile = '/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc'
const renderRequire = createRequire(new URL('../../packages/render/package.json', import.meta.url))
const { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } = renderRequire('pdf-lib')

async function grayColors(bytes: Uint8Array): Promise<number[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const colors: number[] = []
  walkPressGraph(document, {
    content: (_object, stream) => {
      visitContentOperators(decodeContent(stream), (operator, operands) => {
        if ((operator === 'g' || operator === 'G') && operands.length === 1) colors.push(operands[0] ?? Number.NaN)
      })
    },
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    shading: () => false,
  })
  return colors
}

async function suppliedGrayImages(bytes: Uint8Array): Promise<Array<{ sample: number; smask: boolean }>> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const images: Array<{ sample: number; smask: boolean }> = []
  walkPressGraph(document, {
    content: () => undefined,
    function: () => undefined,
    group: () => undefined,
    image: (image) => {
      const width = Number(image.dict.get(PDFName.of('Width'))?.toString())
      const height = Number(image.dict.get(PDFName.of('Height'))?.toString())
      if (width !== 2 || height !== 1 || image.dict.has(PDFName.of('SegnaviaGeneratedEffect'))) return
      images.push({ sample: decodePDFRawStream(image).decode()[0] ?? -1, smask: image.dict.has(PDFName.of('SMask')) })
    },
    shading: () => false,
  })
  return images
}

const forbiddenSpaces = new Set(['/DeviceRGB', '/DeviceCMYK', '/CalRGB'])
const forbiddenOperators = new Set(['rg', 'RG', 'k', 'K'])

interface ColorResidues {
  errors: string[]
  found: string[]
}

async function processColorResidues(bytes: Uint8Array): Promise<ColorResidues> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const errors: string[] = []
  const found = new Set<string>()
  const seen = new WeakSet<object>()
  const scanObject = (object: unknown): void => {
    if (!object || typeof object !== 'object' || seen.has(object as object)) return
    seen.add(object as object)
    if (object instanceof PDFName) {
      const name = object.toString()
      if (forbiddenSpaces.has(name)) found.add(name)
      return
    }
    if (object instanceof PDFArray) {
      const array = object as { get(index: number): unknown; size(): number }
      for (let index = 0; index < array.size(); index++) scanObject(array.get(index))
      return
    }
    if (object instanceof PDFDict) for (const [, value] of (object as { entries(): Iterable<[unknown, unknown]> }).entries()) scanObject(value)
  }
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFRawStream) {
      if (nameOf(object.dict.get(PDFName.of('Subtype'))) === 'Image') continue
      scanObject(object.dict)
      continue
    }
    scanObject(object)
  }
  walkPressGraph(document, {
    content: (object, stream) => {
      try {
        visitContentTokens(decodeContent(stream), (operator, operands) => {
          if (forbiddenOperators.has(operator)) found.add(operator)
          for (const operand of operands) if (operand.kind === 'name' && forbiddenSpaces.has(operand.raw)) found.add(operand.raw)
        })
      } catch (error) {
        errors.push(`${object.toString()}: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    function: () => undefined,
    group: () => undefined,
    image: () => undefined,
    shading: () => false,
  })
  return { errors, found: [...found] }
}

export async function verifyGrayPress(renderer: Renderer, check: Check): Promise<void> {
  const bytes = existsSync(genericGrayProfile) ? new Uint8Array(readFileSync(genericGrayProfile)) : buildGrayProfile('trc-gamma')
  const profile = readProfile(bytes)
  const mid = [0.4, 0.4, 0.4] as [number, number, number]
  const page = {
    html: '<style>@page{size:400px 260px;margin:0}body{margin:24px;font:32px Arial;color:rgb(102,102,102)}.box{width:180px;height:60px;background:linear-gradient(90deg,#f20,#04e);box-shadow:12px 12px 9px #357}.mask{width:160px;height:40px;background:#468;mask-image:linear-gradient(90deg,transparent,black)}img{width:40px;height:20px}</style><p>Gray press</p><div class="box"></div><div class="mask"></div><img id="png"><img id="jpeg">',
    size: { width: 400, height: 220 },
  }
  let report: PressReport | undefined
  const output = await renderer.pagePdf(page, {
    beforeOutput: async (tab) => {
      await tab.evaluate(async () => {
        const imageUrl = (format: 'image/png' | 'image/jpeg') => {
          const canvas = document.createElement('canvas')
          canvas.width = 2
          canvas.height = 1
          const context = canvas.getContext('2d')
          if (!context) throw new Error('test canvas unavailable')
          context.fillStyle = 'rgb(102,102,102)'
          context.fillRect(0, 0, 2, 1)
          if (format === 'image/png') context.clearRect(1, 0, 1, 1)
          return canvas.toDataURL(format, 1)
        }
        const png = document.querySelector<HTMLImageElement>('#png')
        const jpeg = document.querySelector<HTMLImageElement>('#jpeg')
        if (!png || !jpeg) throw new Error('test images unavailable')
        png.src = imageUrl('image/png')
        jpeg.src = imageUrl('image/jpeg')
        await Promise.all([png.decode(), jpeg.decode()])
      })
    },
    press: { profile: bytes, report: (value) => (report = value) },
  })
  const residues = await processColorResidues(output)
  check(
    'gray press has no RGB or CMYK operators or color-space names outside supplied images',
    residues.found.length === 0 && residues.errors.length === 0,
    `residues=${residues.found.join(',') || 'none'} parse errors=${residues.errors.join('; ') || 'none'}`,
  )
  const inspected = await inspectPressPdf(output)
  const colors = await grayColors(output)
  const images = await suppliedGrayImages(output)
  const expected = toGray(profile, mid)[0]
  check(
    'gray press writes only gray vectors, shadings, groups, and generated images with a one-channel output intent',
    report?.destination === 'gray' && inspected.destination === 'gray',
    report ? JSON.stringify(report) : 'report not called',
  )
  check(
    'gray press writes a mid-gray fill through the profile',
    colors.some((value) => Math.abs(value - expected) <= 0.000_002),
    `expected=${expected.toFixed(6)} colors=${colors.map((value) => value.toFixed(6)).join(',')}`,
  )
  check(
    'gray press converts PNG and JPEG samples and preserves PNG transparency',
    report?.convertedImages === 2 &&
      images.length === 2 &&
      images.some((image) => image.smask) &&
      images.every((image) => Math.abs(image.sample - Math.round(expected * 255)) <= 2),
    `converted=${report?.convertedImages ?? 'missing'} images=${JSON.stringify(images)} expected=${Math.round(expected * 255)}`,
  )
}
