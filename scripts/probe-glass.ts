import { readFileSync, writeFileSync } from 'node:fs'
import { openRenderer } from '@segnavia/render'

const html = readFileSync(new URL('../fixtures/fidelity/glass-ui.html', import.meta.url), 'utf8')
const out = process.argv[2]
if (!out) throw new Error('usage: probe-glass.ts <out.pdf>')
const renderer = await openRenderer({
  executablePath: process.env.SEGNAVIA_CHROMIUM ?? '/Users/shmuel/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  concurrency: 1,
})
const bytes = await renderer.pagesPdf([{ html, size: { width: 1100, height: 800 } }])
await renderer.close()
writeFileSync(out, bytes)
console.log('wrote', out, bytes.length)
