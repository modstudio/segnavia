import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { PressReport, Renderer } from '@segnavia/render'
import { toGray } from '../../packages/render/src/color/engine.ts'
import { readProfile } from '../../packages/render/src/color/profile.ts'
import { buildGrayProfile } from '../../packages/render/src/color/profile-fixture.test-helper.ts'
import { inspectPressPdf } from '../../packages/render/src/press/adapter.ts'
import { visitContentOperators } from '../../packages/render/src/press/content.ts'
import { decodeContent } from '../../packages/render/src/press/pdf-objects.ts'
import { walkPressGraph } from '../../packages/render/src/press/visitor.ts'

type Check = (what: string, ok: boolean, detail?: string) => void
const genericGrayProfile = '/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc'
const renderRequire = createRequire(new URL('../../packages/render/package.json', import.meta.url))
const { PDFDocument } = renderRequire('pdf-lib')

async function grayColors(bytes: Uint8Array): Promise<number[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const colors: number[] = []
  walkPressGraph(document, {
    content: (_object, stream, _replace, _resources, mask) => {
      if (mask === 'alpha') return
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

export async function verifyGrayPress(renderer: Renderer, check: Check): Promise<void> {
  const bytes = existsSync(genericGrayProfile) ? new Uint8Array(readFileSync(genericGrayProfile)) : buildGrayProfile('trc-gamma')
  const profile = readProfile(bytes)
  const mid = [107 / 255, 107 / 255, 107 / 255] as [number, number, number]
  const page = {
    html: '<style>@page{size:400px 220px;margin:0}body{margin:24px;font:32px Arial;color:rgb(107,107,107)}.box{width:180px;height:80px;background:linear-gradient(90deg,#f20,#04e);box-shadow:12px 12px 9px #357}.mask{width:160px;height:50px;background:#468;mask-image:linear-gradient(90deg,transparent,black)}</style><p>Gray press</p><div class="box"></div><div class="mask"></div>',
    size: { width: 400, height: 220 },
  }
  let report: PressReport | undefined
  const output = await renderer.pagePdf(page, { press: { profile: bytes, report: (value) => (report = value) } })
  const inspected = await inspectPressPdf(output)
  const colors = await grayColors(output)
  const expected = toGray(profile, mid)[0]
  check(
    'gray press writes only gray vectors, shadings, groups, and generated images with a one-channel output intent',
    report?.destination === 'gray' && inspected.destination === 'gray' && inspected.images.length === 0,
    report ? JSON.stringify(report) : 'report not called',
  )
  check(
    'gray press writes a mid-gray fill through the profile',
    colors.some((value) => Math.abs(value - expected) <= 0.000_002),
    `expected=${expected.toFixed(6)} colors=${colors.map((value) => value.toFixed(6)).join(',')}`,
  )
}
