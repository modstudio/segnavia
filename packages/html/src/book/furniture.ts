import { resolveDirection, textDirection } from '@segnavia/format'
import type { PaginatePageMarks } from './paginate-types.ts'

export interface BookFurnitureValues {
  folio?: string
  runningHead?: string
  marks?: PaginatePageMarks
}

export function fillBookFurniture(html: string, values: BookFurnitureValues, dir?: string, lang?: string): string {
  const motifField: Record<string, 'folio' | 'runningHead'> = {
    'segnavia:folio': 'folio',
    'segnavia:running-head': 'runningHead',
  }
  const declared = dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? dir : undefined

  function attribute(attrs: string, name: string): string | undefined {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const found = new RegExp(`\\s${escaped}\\s*=\\s*(?:(["'])([^"']*)\\1|([^\\s>]+))`, 'i').exec(attrs)
    return found?.[2] ?? found?.[3]
  }

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  return html.replace(
    /<([a-zA-Z][\w:-]*)([^>]*?)\sdata-motif\s*=\s*(?:(["'])([^"']+)\3|([^\s>]+))([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, before, _quote, quoted, unquoted, after) => {
      const key = quoted ?? unquoted
      const field = motifField[key]
      if (!field && key !== 'segnavia:mark') return match
      const attrs = `${before}${after}`
      const name = key === 'segnavia:mark' ? attribute(attrs, 'data-motif-name') : undefined
      const which = key === 'segnavia:mark' && attribute(attrs, 'data-motif-which') === 'last' ? 'last' : 'first'
      const value = field ? values[field] : name === undefined ? undefined : values.marks?.[name]?.[which]
      if (value === undefined) return ''
      const outputAttrs = attrs.replace(/\sdata-motif(?:-[\w-]+)?\s*=\s*(?:(["'])([^"']*)\1|[^\s>]+)/gi, '')
      return `<${tag}${outputAttrs}><bdi dir="${resolveDirection(declared, lang, value)}">${escapeHtml(value)}</bdi></${tag}>`
    },
  )
}

export function embedFunction(name: string, fn: { name: string; toString(): string }): string {
  return `var ${fn.name}=${fn.toString()};var ${name}=${fn.name};`
}

export function furnitureScript(): string {
  return `${embedFunction('textDirection', textDirection)}\n${embedFunction('resolveDirection', resolveDirection)}\n${embedFunction('fillBookFurniture', fillBookFurniture)}`
}
