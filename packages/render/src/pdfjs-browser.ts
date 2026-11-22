import { readFileSync } from 'node:fs'
import type { Page as Tab } from 'playwright-core'

let pdfjsSources: { pdfjsSource: string; workerSource: string } | undefined

/** Reads the pdf.js build and worker on first use, so importing render never pays for them. */
function sources(): { pdfjsSource: string; workerSource: string } {
  pdfjsSources ??= {
    pdfjsSource: readFileSync(new URL(import.meta.resolve('pdfjs-dist/legacy/build/pdf.min.mjs')), 'utf8'),
    workerSource: readFileSync(new URL(import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')), 'utf8'),
  }
  return pdfjsSources
}

export interface PdfjsRasterRequest {
  page: number
  box: { x: number; y: number; width: number; height: number }
  width: number
  height: number
}

interface PdfTextItem {
  text: string
  y: number
}

export function highestTextBaseline(items: readonly PdfTextItem[]): number | null {
  const body = items.filter((item) => item.text.replace(/\u200b/g, '').trim().length > 0)
  return body.length > 0 ? Math.max(...body.map((item) => item.y)) : null
}

export function setPointAtPageStart(highestBaseline: number | null, setPointY: number): boolean {
  return highestBaseline === null || highestBaseline <= setPointY
}

export async function pdfPageHighestTextBaselinesInBrowser(tab: Tab, bytes: Uint8Array, pages: readonly number[]): Promise<Map<number, number | null>> {
  const encoded = Buffer.from(bytes).toString('base64')
  const found = await tab.evaluate(
    async ({ encoded, pages, pdfjsSource, workerSource }) => {
      const moduleUrl = URL.createObjectURL(new Blob([pdfjsSource], { type: 'text/javascript' }))
      const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
      try {
        const pdfjs = await import(moduleUrl)
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const binary = atob(encoded)
        const data = Uint8Array.from(binary, (value) => value.charCodeAt(0))
        const loading = pdfjs.getDocument({ data, enableXfa: false, isEvalSupported: false })
        const pdf = await loading.promise
        try {
          return await Promise.all(
            pages.map(async (pageNumber) => {
              const page = await pdf.getPage(pageNumber)
              const content = await page.getTextContent()
              return [
                pageNumber,
                content.items.flatMap((item: { str?: unknown; transform?: unknown }) => {
                  if (typeof item.str !== 'string' || !Array.isArray(item.transform) || typeof item.transform[5] !== 'number') return []
                  return [{ text: item.str, y: item.transform[5] }]
                }),
              ] as const
            }),
          )
        } finally {
          await loading.destroy()
        }
      } finally {
        URL.revokeObjectURL(moduleUrl)
        URL.revokeObjectURL(workerUrl)
      }
    },
    { encoded, pages: [...pages], ...sources() },
  )
  return new Map(found.map(([page, items]) => [page, highestTextBaseline(items)]))
}

export async function rasterPdfPageInBrowser(tab: Tab, bytes: Uint8Array, request: PdfjsRasterRequest): Promise<Uint8Array> {
  const encoded = Buffer.from(bytes).toString('base64')
  const rendered = await tab.evaluate(
    async ({ encoded, pdfjsSource, request, workerSource }) => {
      const moduleUrl = URL.createObjectURL(new Blob([pdfjsSource], { type: 'text/javascript' }))
      const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
      try {
        const pdfjs = await import(moduleUrl)
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const binary = atob(encoded)
        const data = Uint8Array.from(binary, (value) => value.charCodeAt(0))
        const loading = pdfjs.getDocument({ data, enableXfa: false, isEvalSupported: false })
        const pdf = await loading.promise
        try {
          const page = await pdf.getPage(request.page)
          const viewport = page.getViewport({ scale: 1 })
          const { x, y, width, height } = request.box
          const corners = [
            viewport.convertToViewportPoint(x, y),
            viewport.convertToViewportPoint(x + width, y),
            viewport.convertToViewportPoint(x, y + height),
            viewport.convertToViewportPoint(x + width, y + height),
          ]
          const left = Math.min(...corners.map(([value]) => value))
          const top = Math.min(...corners.map(([, value]) => value))
          const right = Math.max(...corners.map(([value]) => value))
          const scale = request.width / (right - left)
          const canvas = new OffscreenCanvas(request.width, request.height)
          const context = canvas.getContext('2d', { alpha: false })
          if (!context) throw new Error('Chromium could not create a 2D canvas for PDF rendering')
          context.fillStyle = 'white'
          context.fillRect(0, 0, request.width, request.height)
          await page.render({
            annotationMode: pdfjs.AnnotationMode.DISABLE,
            canvasContext: context,
            transform: [scale, 0, 0, scale, -left * scale, -top * scale],
            viewport,
          }).promise
          const blob = await canvas.convertToBlob({ type: 'image/png' })
          const output = new Uint8Array(await blob.arrayBuffer())
          let text = ''
          for (let offset = 0; offset < output.length; offset += 32_768)
            text += String.fromCharCode(...output.subarray(offset, Math.min(output.length, offset + 32_768)))
          return btoa(text)
        } finally {
          await loading.destroy()
        }
      } finally {
        URL.revokeObjectURL(moduleUrl)
        URL.revokeObjectURL(workerUrl)
      }
    },
    { encoded, request, ...sources() },
  )
  return new Uint8Array(Buffer.from(rendered, 'base64'))
}
