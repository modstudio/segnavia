import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { fromPress, readProfile } from '../../packages/render/src/color/index.ts'
import { deviceToSrgb, proofPressPixels, proofTable } from './image.ts'
import { pressGhostscript } from './readers.ts'
import { decodeDeviceTiff } from './tiff.ts'

const profilePath = '/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc'
const ghostscriptAvailable = ['/opt/homebrew/bin/gs', '/usr/local/bin/gs', '/usr/bin/gs'].some(existsSync)

function sampled(pixels: ArrayLike<number>, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 3
  return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0]
}

function expectClose(actual: number[], expected: ArrayLike<number>, tolerance: number): void {
  for (let channel = 0; channel < 3; channel++) expect(Math.abs((actual[channel] ?? 0) - (expected[channel] ?? 0))).toBeLessThanOrEqual(tolerance)
}

test.skipIf(!ghostscriptAvailable || !existsSync(profilePath))('models an RGB image and CMYK fill through the press profile', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'segnavia-press-raster-'))
  try {
    const profileBytes = new Uint8Array(await Bun.file(profilePath).arrayBuffer())
    const profile = readProfile(profileBytes)
    const document = await PDFDocument.create()
    const page = document.addPage([20, 10])
    const image = document.context.register(
      document.context.flateStream(Uint8Array.of(40, 120, 220), {
        Type: 'XObject',
        Subtype: 'Image',
        Width: 1,
        Height: 1,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
      }),
    )
    page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Image: image } }))
    page.node.set(
      PDFName.of('Contents'),
      document.context.register(document.context.stream('q 10 0 0 10 0 0 cm /Image Do Q 0.2 0.5 0.1 0.3 k 10 0 10 10 re f')),
    )
    const profileReference = document.context.register(document.context.stream(profileBytes, { N: 4 }))
    const intent = document.context.register(
      document.context.obj({
        Type: 'OutputIntent',
        S: 'GTS_PDFX',
        OutputConditionIdentifier: PDFString.of('Custom'),
        DestOutputProfile: profileReference,
      }),
    )
    document.catalog.set(PDFName.of('OutputIntents'), document.context.obj([intent]))
    const pdf = path.join(directory, 'sample.pdf')
    const tiff = path.join(directory, 'sample.tiff')
    await Bun.write(pdf, await document.save())

    const rendered = await pressGhostscript(pdf, tiff, 20, 10, profilePath, 'cmyk')
    expect(rendered.worked, rendered.error).toBeTrue()
    const device = decodeDeviceTiff(new Uint8Array(await Bun.file(tiff).arrayBuffer()), 20, 10, 4)
    const modelled = deviceToSrgb(profile, device)
    const imageExpected = proofPressPixels(profile, proofTable(profileBytes), Uint8Array.of(40, 120, 220))
    const fillExpected = fromPress(profile, [0.2, 0.5, 0.1, 0.3]).map((channel) => channel * 255)
    expectClose(sampled(modelled, 20, 5, 5), imageExpected, 2)
    expectClose(sampled(modelled, 20, 15, 5), Uint8ClampedArray.from(fillExpected), 1)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
