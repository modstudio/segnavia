import { Cover, type Cover as CoverValue } from './cover.ts'
import type { Sound } from './sound.ts'
import { soundFace } from './sound-face.ts'

export function soundCover(sound: Sound): CoverValue {
  const html = `<style>
*{box-sizing:border-box}body{margin:0;inline-size:100vw;block-size:100vh;font:5mm/1.25 system-ui,sans-serif}
.cover{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:8mm;align-items:center;inline-size:100%;block-size:100%;padding-block:10mm;padding-inline:12mm;background:#f4f4f4;color:#171717}
.face{display:flex;align-items:center;justify-content:center;min-inline-size:0;block-size:100%;overflow:hidden}.face img{max-inline-size:100%;max-block-size:100%;object-fit:contain}
.glyph{font-size:32mm;line-height:1}.text{display:flex;flex-direction:column;gap:4mm;min-inline-size:0}.title{font-size:10mm;font-weight:700}.duration,.credit{font-size:5mm}.title,.duration,.credit{unicode-bidi:isolate;overflow-wrap:anywhere}
</style><main class="cover">${soundFace(sound)}</main>`
  return Cover.parse({
    page: {
      type: 'document',
      kind: 'page',
      settings: { scripts: 'refuse' },
      children: [{ type: 'page', body: { html } }],
    },
  })
}
