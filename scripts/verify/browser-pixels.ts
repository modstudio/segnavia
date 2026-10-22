import type { Renderer } from '@segnavia/render'

export type BrowserPixels = { width: number; height: number; rgba: number[] }

// Decodes a PNG with the renderer's own Chromium, so render checks need no
// image tool beyond the browser they already drive.
export async function pngPixels(renderer: Renderer, image: Uint8Array): Promise<BrowserPixels> {
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
