import { resolveDirection, textDirection } from '@segnavia/format'

export interface BookFurnitureValues {
  folio?: string
  runningHead?: string
}

export function fillBookFurniture(html: string, values: BookFurnitureValues, dir?: string, lang?: string): string {
  const motifField: Record<string, keyof BookFurnitureValues> = {
    'segnavia:folio': 'folio',
    'segnavia:running-head': 'runningHead',
  }
  const declared = dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? dir : undefined

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  return html.replace(
    /<([a-zA-Z][\w:-]*)([^>]*?)\sdata-motif\s*=\s*(?:(["'])([^"']+)\3|([^\s>]+))([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, before, _quote, quoted, unquoted, after) => {
      const key = quoted ?? unquoted
      const field = motifField[key]
      if (!field) return match
      const value = values[field]
      if (value === undefined) return ''
      const attrs = `${before}${after}`.replace(/\sdata-motif\s*=\s*(?:(["'])([^"']+)\1|[^\s>]+)/i, '')
      return `<${tag}${attrs}><bdi dir="${resolveDirection(declared, lang, value)}">${escapeHtml(value)}</bdi></${tag}>`
    },
  )
}

export function furnitureScript(): string {
  return `var ${textDirection.name}=${textDirection.toString()};var textDirection=${textDirection.name};\nvar ${resolveDirection.name}=${resolveDirection.toString()};var resolveDirection=${resolveDirection.name};\nvar ${fillBookFurniture.name}=${fillBookFurniture.toString()};var fillBookFurniture=${fillBookFurniture.name};`
}
