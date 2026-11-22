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

export function soundFace(sound: Sound): string {
  const duration = formatDuration(sound.durationMs)
  const direction = resolveDirection(undefined, undefined, duration)
  const image = sound.image ? `<img data-segnavia-media="${escapeHtml(sound.image)}" alt="" />` : '<div class="glyph" aria-hidden="true">♪</div>'
  return `<div class="face">${image}</div><div class="text">${textField('title', sound.title)}<div class="duration"><bdi dir="${direction}">${duration}</bdi></div>${textField('credit', sound.credit)}</div>`
}
