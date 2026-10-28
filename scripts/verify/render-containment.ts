import { type Renderer, RendererUnavailableError, RenderRefusedError } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

const pdfMagic = (bytes: Uint8Array) => bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46

const refusal = (work: Promise<unknown>) =>
  work.then(
    () => 'rendered',
    (error: unknown) => (error instanceof RenderRefusedError ? `refused: ${error.message}` : `other: ${String(error)}`),
  )

const unavailable = (work: Promise<unknown>) =>
  work.then(
    () => 'rendered',
    (error: unknown) => (error instanceof RendererUnavailableError ? `unavailable: ${error.message}` : `other: ${String(error)}`),
  )

export async function verifyRenderContainment(renderer: Renderer, check: Check, heapMb: number): Promise<void> {
  const [heapResult, ordinaryPdf] = await Promise.all([
    refusal(
      renderer.pagePdf(
        { html: '<script>const chunks = []; for (;;) chunks.push(new Array(1e5).fill(0))</script>', scripts: 'sandboxed', size: { width: 400, height: 200 } },
        { waitForPageReady: false },
      ),
    ),
    renderer.pagePdf({ html: '<p>ordinary</p>', size: { width: 400, height: 200 } }),
  ])
  check(
    'a page that exhausts the heap is refused while a concurrent page prints',
    heapResult.startsWith('refused:') && heapResult.includes(`${heapMb} MB`) && pdfMagic(ordinaryPdf),
    `${heapResult}; ordinary=${ordinaryPdf.length}`,
  )
  const crashed = await unavailable(
    renderer.pagePdf(
      { html: '<p>crash</p>', size: { width: 400, height: 200 } },
      {
        beforeOutput: async (tab) => {
          await (await tab.context().newCDPSession(tab)).send('Browser.crash')
        },
      },
    ),
  )
  check('a browser that exits mid-render is refused as unavailable', crashed.startsWith('unavailable:'), crashed)
  const afterCrash = await renderer.pagePdf({ html: '<p>after crash</p>', size: { width: 400, height: 200 } })
  check('the next render after a browser exit returns a PDF', pdfMagic(afterCrash), `bytes=${afterCrash.length}`)
  await renderer.close()
  const afterClose = await unavailable(renderer.pagePdf({ html: '<p>closed</p>', size: { width: 400, height: 200 } }))
  check('a render after close is refused as unavailable', afterClose.startsWith('unavailable:'), afterClose)
}
