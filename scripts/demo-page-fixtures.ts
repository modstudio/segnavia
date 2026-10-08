import './source-guard.ts'
import type { PageInput } from '@segnavia/format'

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
