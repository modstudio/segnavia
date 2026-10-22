import type { Renderer } from '@segnavia/render'
import { proof } from '../../packages/render/src/color/engine.ts'
import { readProfile } from '../../packages/render/src/color/profile.ts'

type Check = (what: string, ok: boolean, detail?: string) => void
type Pixel = [number, number, number]

async function pixels(renderer: Renderer, image: Uint8Array): Promise<{ width: number; height: number; rgba: number[] }> {
  const source = Buffer.from(image).toString('base64')
  let decoded = { width: 0, height: 0, rgba: [] as number[] }
  const captured = new Error('proof verification pixels captured')
  try {
    await renderer.pageImage(
      {
        size: { width: 1, height: 1 },
        scripts: 'sandboxed',
        html: `<canvas id="canvas"></canvas><img id="source" src="data:image/png;base64,${source}"><script>
source.onload=()=>{canvas.width=source.naturalWidth;canvas.height=source.naturalHeight;canvas.getContext('2d').drawImage(source,0,0);pageReady()}
</script>`,
      },
      {
        beforeOutput: async (tab) => {
          decoded = await tab.evaluate(() => {
            const canvas = document.querySelector('canvas') as HTMLCanvasElement
            return {
              width: canvas.width,
              height: canvas.height,
              rgba: Array.from(canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data ?? []),
            }
          })
          throw captured
        },
      },
    )
  } catch (error) {
    if (error !== captured) throw error
  }
  return decoded
}

function at(image: { width: number; height: number; rgba: number[] }, x: number, y: number): Pixel {
  const offset = (Math.min(image.height - 1, y) * image.width + Math.min(image.width - 1, x)) * 4
  return [image.rgba[offset] ?? 0, image.rgba[offset + 1] ?? 0, image.rgba[offset + 2] ?? 0]
}

const distance = (left: Pixel, right: Pixel) => Math.max(...left.map((value, channel) => Math.abs(value - (right[channel] ?? 0))))

export async function verifyPressProof(renderer: Renderer, profileBytes: Uint8Array, check: Check): Promise<void> {
  const page = {
    size: { width: 320, height: 160 },
    scripts: 'sandboxed' as const,
    html: `<style>html,body{margin:0;width:100%;height:100%}body{background:linear-gradient(90deg,#f00,#0f0,#00f)}img{width:80px;height:80px;margin:40px}</style>
<img id="raster"><script>const c=document.createElement('canvas');c.width=80;c.height=80;const x=c.getContext('2d');x.fillStyle='#ff00ff';x.fillRect(0,0,80,80);raster.src=c.toDataURL('image/png');raster.onload=()=>pageReady()</script>`,
  }
  const originalBytes = await renderer.pageImage(page)
  const proofedBytes = await renderer.pageImage(page, { proof: { profile: profileBytes } })
  const suppliedBytes = await renderer.proofImage(originalBytes, { profile: profileBytes })
  const [original, proofed, supplied] = await Promise.all([pixels(renderer, originalBytes), pixels(renderer, proofedBytes), pixels(renderer, suppliedBytes)])
  const profile = readProfile(profileBytes)
  let maximum = 0
  for (const [x, y] of [
    [8, 8],
    [155, 8],
    [310, 8],
    [80, 80],
  ] as const) {
    const source = at(original, x, y)
    const expected = proof(profile, [source[0] / 255, source[1] / 255, source[2] / 255]).map((value) => Math.round(value * 255)) as Pixel
    maximum = Math.max(maximum, distance(at(proofed, x, y), expected), distance(at(supplied, x, y), expected))
  }
  check('pageImage and proofImage pixels match the press engine proof', maximum <= 3, `maximum channel difference=${maximum} (bound 3)`)
  const redMove = distance(at(original, 8, 8), at(proofed, 8, 8))
  check('the press proof visibly moves an out-of-gamut RGB primary', redMove >= 8, `red maximum channel movement=${redMove}`)
}
