import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import { normalizeCropBox } from './pdf.ts'

describe('fidelity PDF boxes', () => {
  test('moves a non-zero crop origin to a zero-origin media page', async () => {
    const work = await mkdtemp(path.join(tmpdir(), 'segnavia-fidelity-pdf-'))
    try {
      const source = path.join(work, 'source.pdf')
      const destination = path.join(work, 'normalized.pdf')
      const document = await PDFDocument.create()
      const page = document.addPage([200, 300])
      page.drawRectangle({ x: 10, y: 20, width: 100, height: 150, color: rgb(1, 0, 0) })
      page.setCropBox(10, 20, 100, 150)
      await Bun.write(source, await document.save())

      await normalizeCropBox(source, destination)

      const normalized = await PDFDocument.load(await Bun.file(destination).arrayBuffer())
      expect(normalized.getPage(0)?.getMediaBox()).toEqual({ x: 0, y: 0, width: 100, height: 150 })
      expect(normalized.getPage(0)?.getCropBox()).toEqual({ x: 0, y: 0, width: 100, height: 150 })
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  })
})
