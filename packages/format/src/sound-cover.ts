import { Cover, type Cover as CoverValue } from './cover.ts'
import { resolveDirection } from './direction.ts'
import { formatDuration } from './duration.ts'
import { type MediaText, mediaTextDirection } from './media.ts'
import type { Sound } from './sound.ts'

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function textField(name: string, value: MediaText | undefined): string {
  if (!value) return ''
  const direction = mediaTextDirection(value)
  const resolved = resolveDirection(direction, value.lang, value.text)
  const lang = value.lang ? ` lang="${escapeHtml(value.lang)}"` : ''
  return `<div class="${name}"><bdi dir="${resolved}"${lang}>${escapeHtml(value.text)}</bdi></div>`
}

export function soundCover(sound: Sound): CoverValue {
  const duration = formatDuration(sound.durationMs)
  const direction = resolveDirection(undefined, undefined, duration)
  const image = sound.image ? `<img data-segnavia-media="${escapeHtml(sound.image)}" alt="" />` : '<div class="glyph" aria-hidden="true">♪</div>'
  const html = `<style>
*{box-sizing:border-box}body{margin:0;inline-size:100vw;block-size:100vh;font:5mm/1.25 system-ui,sans-serif}
.cover{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:8mm;align-items:center;inline-size:100%;block-size:100%;padding-block:10mm;padding-inline:12mm;background:#f4f4f4;color:#171717}
.face{display:flex;align-items:center;justify-content:center;min-inline-size:0;block-size:100%;overflow:hidden}.face img{max-inline-size:100%;max-block-size:100%;object-fit:contain}
.glyph{font-size:32mm;line-height:1}.text{display:flex;flex-direction:column;gap:4mm;min-inline-size:0}.title{font-size:10mm;font-weight:700}.duration,.credit{font-size:5mm}.title,.duration,.credit{unicode-bidi:isolate;overflow-wrap:anywhere}
</style><main class="cover"><div class="face">${image}</div><div class="text">${textField('title', sound.title)}<div class="duration"><bdi dir="${direction}">${duration}</bdi></div>${textField('credit', sound.credit)}</div></main>`
  return Cover.parse({
    page: {
      type: 'document',
      kind: 'page',
      settings: { scripts: 'refuse' },
      children: [{ type: 'page', body: { html } }],
    },
  })
}
