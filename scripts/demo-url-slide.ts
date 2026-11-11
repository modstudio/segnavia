import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FontManifest, type FontSource } from '@segnavia/format'
import { bridgeForHost, resolveFonts } from '@segnavia/frame/bridge'

export const urlSlideFonts = FontManifest.parse({ host: { faces: [{}], generic: 'sans-serif' } })

export async function urlSlideHtml(root: string): Promise<string> {
  const source: FontSource = {
    font: async (name) =>
      name === 'host'
        ? {
            family: 'Demo Alef',
            generic: 'sans-serif',
            faces: [{ family: 'Demo Alef', data: readFileSync(path.join(root, 'fixtures/hebrew-notice/Alef-Regular.ttf')), format: 'truetype' }],
          }
        : undefined,
  }
  const resolved = await resolveFonts(urlSlideFonts, { source })
  if (resolved.failures.length > 0) throw new Error(`The media deck fonts are unavailable: ${JSON.stringify(resolved.failures)}`)
  return `<!doctype html><html><head><style>${resolved.css}</style></head><body style="margin:0;display:grid;place-content:center;height:100vh;font-size:48px;font-family:var(--segnavia-font-host)"><h1 id="served">Served by the host</h1><script>${bridgeForHost({ fonts: urlSlideFonts })}</script></body></html>`
}
