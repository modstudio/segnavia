import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FontManifest, type FontSource, type Narration, type VoicedNarration } from '@segnavia/format'
import { bridgeForHost, resolveFonts } from '@segnavia/frame/bridge'
import { wordIndex } from '@segnavia/frame/timeline'

export const urlSlideFonts = FontManifest.parse({ host: { faces: [{}], generic: 'sans-serif' } })
export const URL_SLIDE_FONT_FAMILY = 'Demo Alef'
export const URL_SLIDE_NARRATION = 'Hosted marks show first and then second.'
export const urlSlideCues = (narration: Pick<VoicedNarration, 'words'>): Narration['cues'] => [
  { word: wordIndex(narration, 'first'), annotation: 0 },
  { word: wordIndex(narration, 'second'), annotation: 1 },
]
export const urlSlidePlayer = `<segnavia-player id="player" hash="off" presentation="native"></segnavia-player>
  <script type="module">
    await customElements.whenDefined('segnavia-player')
    const player = document.getElementById('player')
    player.placements = { resolve: async ({ address }) => address === 'demo-sound' ? {
      kind: 'sound', sound: { format: 'wav', durationMs: 2400, title: { text: 'Demo tone' } }, src: 'audio/tone.wav'
    } : undefined }
    player.resolveSlide = (slide) => slide.content.kind === 'url' ? { ...slide.content, bridge: true } : slide.content
    player.setAttribute('src', 'deck-media.json')
  </script>`

export async function urlSlideHtml(root: string): Promise<string> {
  const source: FontSource = {
    font: async (name) =>
      name === 'host'
        ? {
            family: URL_SLIDE_FONT_FAMILY,
            faces: [
              {
                family: URL_SLIDE_FONT_FAMILY,
                data: readFileSync(path.join(root, 'fixtures/hebrew-notice/Alef-Regular.ttf')),
                format: 'truetype',
              },
            ],
          }
        : undefined,
  }
  const resolved = await resolveFonts(urlSlideFonts, { source })
  if (resolved.failures.length > 0) throw new Error(`The media deck fonts are unavailable: ${JSON.stringify(resolved.failures)}`)
  return `<!doctype html><html><head><style>${resolved.css}[data-segnavia-cues] [data-annotation]:not([data-shown]){visibility:hidden}</style></head><body style="margin:0;display:grid;place-content:center;height:100vh;font-size:48px;font-family:var(--segnavia-font-host)"><h1 id="served">Served by the host</h1><p data-annotation="0">First hosted mark</p><p data-annotation="1">Second hosted mark</p><script>${bridgeForHost({ fonts: urlSlideFonts })}</script></body></html>`
}
