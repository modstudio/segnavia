import './source-guard.ts'
import type { ImpositionInput, PageInput } from '@segnavia/format'

export const fluidPage: PageInput = {
  html:
    '<!doctype html><html><body style="margin:0;font-family:system-ui,sans-serif"><header style="padding:48px;background:#0f766e;color:#fff"><h1 style="margin:0">A page for the web</h1></header><main style="padding:48px;max-width:720px">' +
    "<p>Pages have no paper. This one is fluid: it renders at the viewer's width and as tall as its content.</p>".repeat(12) +
    '</main><script>document.body.style.background = "red"</script></body></html>',
  size: 'fluid',
}

export const hebrewPage: PageInput = {
  html: '<h1 style="font-family:sans-serif">שלום</h1><p>A page set right to left.</p>',
  size: { width: 600, height: 'auto' },
  dir: 'rtl',
  lang: 'he',
}

export const rightToLeftDivPage: PageInput = {
  html: [
    '<div>English text directly in a div.</div>',
    '<section>English text directly in a section.</section>',
    '<article>English text directly in an article.</article>',
    '<aside>English text directly in an aside.</aside>',
    '<address>English text directly in an address.</address>',
  ].join(''),
  size: { width: 600, height: 'auto' },
  dir: 'rtl',
  lang: 'he',
}

export const fixedPage: PageInput = {
  html: '<div style="font:24px sans-serif">Fixed page</div>',
  size: { width: 420, height: 240 },
}

export const marginPage: PageInput = {
  html: '<span style="font:12px sans-serif">MARGIN_MARKER</span>',
  size: 'fluid',
  print: { paper: 'letter', orientation: 'portrait', margin: { top: 15, right: 15, bottom: 15, left: 15 } },
}

export const postcardPage: PageInput = {
  html: '<!doctype html><html style="margin:0;background:#b9e6df"><body style="margin:0;padding:var(--segnavia-safe);font:18px system-ui,sans-serif">Greetings from Segnavia.</body></html>',
  size: 'fluid',
  print: {
    paper: { width: 148, height: 105, unit: 'mm' },
    orientation: 'landscape',
    bleed: 3,
    safe: 5,
    marks: true,
  },
}

export const postcardBackPage: PageInput = {
  ...postcardPage,
  html: '<!doctype html><html style="margin:0;background:#f7c8a8"><body style="margin:0;padding:var(--segnavia-safe);font:18px system-ui,sans-serif">The other side of the postcard.</body></html>',
}

const labelColors = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#ede9fe', '#ffedd5']
export const labelPages: PageInput[] = Array.from({ length: 31 }, (_, index) => ({
  html: `<html style="background:${labelColors[index % labelColors.length]};font:10px sans-serif"><body><p>Label ${index + 1}</p></body></html>`,
  size: 'fluid',
}))

export const labelsImposition: ImpositionInput = {
  paper: 'letter',
  orientation: 'portrait',
  unit: 'in',
  columns: 3,
  rows: 10,
  cell: { width: 2.625, height: 1 },
  margin: { top: 0.5, right: 0, bottom: 0, left: 0.1875 },
  gap: { column: 0.125, row: 0 },
}

export const fixedImposedPage: PageInput = {
  html: '<!doctype html><html style="margin:0;background:rgb(80,80,80)"><body style="margin:0"></body></html>',
  size: { width: 600, height: 400 },
}

const fixedImposition: ImpositionInput = {
  paper: { width: 120, height: 90, unit: 'mm' },
  orientation: 'landscape',
  columns: 1,
  rows: 1,
  cell: { width: 100, height: 70 },
  margin: { top: 10, right: 10, bottom: 10, left: 10 },
  bleed: 3,
}

export const coveringImposition: ImpositionInput = { ...fixedImposition, fit: 'cover' }
export const containedImposition: ImpositionInput = { ...fixedImposition, fit: 'contain' }

export const bleedGridShades = [60, 100, 140, 180]
export const bleedGridPages: PageInput[] = bleedGridShades.map((shade) => ({
  html: `<!doctype html><html style="margin:0;background:rgb(${shade},${shade},${shade})"><body style="margin:0"></body></html>`,
  size: 'fluid',
}))

const bleedGrid: ImpositionInput = {
  paper: { width: 56, height: 56, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 20, height: 20 },
  margin: { top: 5, right: 5, bottom: 5, left: 5 },
  gap: { column: 6, row: 6 },
  bleed: 2,
}

export const bleedGridImposition = bleedGrid
export const clippedBleedGridImposition: ImpositionInput = {
  ...bleedGrid,
  paper: { width: 52, height: 52, unit: 'mm' },
  gap: { column: 2, row: 2 },
}
