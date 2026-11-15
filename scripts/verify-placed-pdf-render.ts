import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openRenderer } from '@segnavia/render'
import { chromiumPath } from './chromium-path.ts'
import { verifyPlacedPdfRender } from './verify/placed-pdf-render.ts'

let failures = 0
const renderer = await openRenderer({ executablePath: chromiumPath() })
const work = mkdtempSync(path.join(tmpdir(), 'segnavia-placed-pdf-'))
try {
  await verifyPlacedPdfRender(renderer, work, (what, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? ` (${detail})` : ''}`)
    if (!ok) failures += 1
  })
} finally {
  await renderer.close()
  rmSync(work, { recursive: true, force: true })
}
if (failures > 0) throw new Error(`${failures} placed PDF checks failed`)
