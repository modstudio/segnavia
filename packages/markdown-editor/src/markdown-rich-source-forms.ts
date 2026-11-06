import {
  type AnyExtension,
  type JSONContent,
  type MarkdownParseHelpers,
  type MarkdownRendererHelpers,
  type RenderContext,
  renderNestedMarkdownContent,
} from '@tiptap/core'

type Token = { raw?: string; type?: string; depth?: number; lang?: string; text?: string; tokens?: Token[]; items?: Token[] }
type FormAttrs = Record<string, unknown>
type AttributeContext = { parent?: () => Record<string, unknown> }
type ParseContext = { parent?: (token: Token, helpers: MarkdownParseHelpers) => unknown }
type MarkdownRenderContext = {
  parent?: (node: JSONContent, helpers: MarkdownRendererHelpers, context: RenderContext) => string
}

const hidden = (defaultValue: unknown = null) => ({ default: defaultValue, renderHTML: () => ({}) })

function withAttrs(value: unknown, attrs: FormAttrs): unknown {
  if (!value || Array.isArray(value) || typeof value !== 'object') return value
  const node = value as JSONContent
  return { ...node, attrs: { ...node.attrs, ...attrs } }
}

function sourceFormAttrs(names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, hidden()]))
}

function delimiter(token: Token): string | null {
  const first = token.raw?.[0]
  return first === '_' || first === '*' ? first : null
}

function titleQuote(raw: string | undefined): string | null {
  if (!raw) return null
  const match = /\s(["'(])(?=[\s\S]*(?:"|'|\))\)$)/g
  let quote: string | null = null
  for (const hit of raw.matchAll(match)) quote = hit[1] ?? null
  return quote
}

function safeTitleQuote(value: unknown, quote: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  if (quote === "'" && !value.includes("'")) return "'"
  if (quote === '(' && !value.includes(')')) return '('
  return '"'
}

function fenceAttrs(token: Token): FormAttrs {
  const lines = (token.raw ?? '').replace(/\n$/, '').split('\n')
  const opening = /^ {0,3}(`{3,}|~{3,})([^\n]*)/.exec(lines[0] ?? '')
  if (!opening) return {}
  const fence = opening[1] ?? ''
  const suffix = opening[2] ?? ''
  const language = token.lang ?? ''
  const at = language ? suffix.indexOf(language) : -1
  const infoBefore = at >= 0 ? suffix.slice(0, at) : suffix
  const infoAfter = at >= 0 ? suffix.slice(at + language.length) : ''
  const closing = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`).test(lines.at(-1) ?? '')
    ? (lines.at(-1)?.trim() ?? fence)
    : fence
  return { sourceFence: fence, sourceClosingFence: closing, sourceInfoBefore: infoBefore, sourceInfoAfter: infoAfter }
}

function fenceIsSafe(content: string, fence: string): boolean {
  const character = fence[0]
  if ((character !== '`' && character !== '~') || fence.length < 3) return false
  const close = new RegExp(`^ {0,3}${character === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`, 'm')
  return !close.test(content)
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(record)) {
    if (key.startsWith('source') || key === 'dir' || item === null || item === undefined) continue
    if ((key === 'colspan' || key === 'rowspan') && item === 1) continue
    const next = stable(item)
    if (next && typeof next === 'object' && !Array.isArray(next) && Object.keys(next as Record<string, unknown>).length === 0) continue
    out[key] = next
  }
  return out
}

const rowSignature = (row: JSONContent) => JSON.stringify(stable(row))

function rowCells(line: string): Array<{ start: number; end: number }> {
  const pipes: number[] = []
  for (let index = 0; index < line.length; index++) {
    if (line[index] !== '|') continue
    let escapes = 0
    for (let before = index - 1; before >= 0 && line[before] === '\\'; before--) escapes++
    if (escapes % 2 === 0) pipes.push(index)
  }
  const bounds = [-1, ...pipes, line.length]
  const cells = bounds.slice(0, -1).map((left, index) => ({ start: left + 1, end: bounds[index + 1] ?? line.length }))
  if (cells[0] && !line.slice(cells[0].start, cells[0].end).trim()) cells.shift()
  if (cells.at(-1) && !line.slice(cells.at(-1)?.start, cells.at(-1)?.end).trim()) cells.pop()
  return cells
}

function changedRow(source: string, normalized: string, signature: string, row: JSONContent): string {
  let old: JSONContent
  try {
    old = JSON.parse(signature) as JSONContent
  } catch {
    return normalized
  }
  const sourceCells = rowCells(source)
  const normalizedCells = rowCells(normalized)
  if (sourceCells.length !== row.content?.length || normalizedCells.length !== row.content.length) return normalized
  let output = source
  for (let index = sourceCells.length - 1; index >= 0; index--) {
    if (JSON.stringify(stable(old.content?.[index])) === JSON.stringify(stable(row.content?.[index]))) continue
    const target = sourceCells[index]
    const replacement = normalizedCells[index]
    if (!target || !replacement) return normalized
    const original = source.slice(target.start, target.end)
    const leading = /^\s*/.exec(original)?.[0] ?? ''
    const trailing = /\s*$/.exec(original)?.[0] ?? ''
    const content = normalized.slice(replacement.start, replacement.end).trim()
    output = `${output.slice(0, target.start)}${leading}${content}${trailing}${output.slice(target.end)}`
  }
  return output
}

function tableLines(raw: string): { rows: string[]; delimiter: string; columns: number } {
  const lines = raw.replace(/\n$/, '').split('\n')
  const delimiter = lines[1] ?? ''
  const columns = delimiter
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|').length
  return { rows: [lines[0] ?? '', ...lines.slice(2)], delimiter, columns }
}

function extendInlineForm(extension: AnyExtension): AnyExtension {
  if (extension.name !== 'italic' && extension.name !== 'bold') return extension
  const attrName = extension.name === 'italic' ? 'sourceEmphasisDelimiter' : 'sourceStrongDelimiter'
  return extension.extend({
    addAttributes(this: AttributeContext) {
      return { ...this.parent?.(), ...sourceFormAttrs([attrName]) }
    },
    parseMarkdown(this: ParseContext, token: Token, helpers: MarkdownParseHelpers): JSONContent {
      const parsed: unknown = this.parent?.(token, helpers)
      return withAttrs(parsed, { [attrName]: delimiter(token) }) as JSONContent
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      const count = extension.name === 'bold' ? 2 : 1
      const recorded = node.attrs?.[attrName]
      const marker = recorded === '_' || recorded === '*' ? recorded.repeat(count) : '*'.repeat(count)
      return `${marker}${helpers.renderChildren(node)}${marker}`
    },
  })
}

function extendHeading(extension: AnyExtension): AnyExtension {
  if (extension.name !== 'heading') return extension
  return extension.extend({
    addAttributes(this: AttributeContext) {
      return { ...this.parent?.(), ...sourceFormAttrs(['sourceHeadingStyle', 'sourceSetextUnderline']) }
    },
    parseMarkdown(this: ParseContext, token: Token, helpers: MarkdownParseHelpers): JSONContent {
      const parsed: unknown = this.parent?.(token, helpers)
      const lines = token.raw?.replace(/\n$/, '').split('\n') ?? []
      const underline = lines.length > 1 && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines.at(-1) ?? '') ? lines.at(-1) : null
      return withAttrs(parsed, { sourceHeadingStyle: underline ? 'setext' : 'atx', sourceSetextUnderline: underline }) as JSONContent
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      const content = helpers.renderChildren(node.content ?? [])
      if (node.attrs?.sourceHeadingStyle === 'setext' && typeof node.attrs.sourceSetextUnderline === 'string') {
        return `${content}\n${node.attrs.sourceSetextUnderline}`
      }
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      return `${'#'.repeat(level)} ${content}`
    },
  })
}

function extendHardBreak(extension: AnyExtension): AnyExtension {
  if (extension.name !== 'hardBreak') return extension
  return extension.extend({
    addAttributes(this: AttributeContext) {
      return { ...this.parent?.(), ...sourceFormAttrs(['sourceHardBreak']) }
    },
    parseMarkdown(token: Token) {
      return { type: 'hardBreak', attrs: { sourceHardBreak: token.raw?.slice(0, -1) ?? null } }
    },
    renderMarkdown(node: JSONContent) {
      const form = node.attrs?.sourceHardBreak
      return `${form === '\\' || (typeof form === 'string' && /^ {2,}$/.test(form)) ? form : '  '}\n`
    },
  })
}

function extendCodeBlock(extension: AnyExtension): AnyExtension {
  if (extension.name !== 'codeBlock') return extension
  return extension.extend({
    addAttributes(this: AttributeContext) {
      return {
        ...this.parent?.(),
        ...sourceFormAttrs(['sourceFence', 'sourceClosingFence', 'sourceInfoBefore', 'sourceInfoAfter']),
      }
    },
    parseMarkdown(this: ParseContext, token: Token, helpers: MarkdownParseHelpers): JSONContent {
      return withAttrs(this.parent?.(token, helpers), fenceAttrs(token)) as JSONContent
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      const content = helpers.renderChildren(node.content ?? [])
      const recorded = typeof node.attrs?.sourceFence === 'string' ? node.attrs.sourceFence : ''
      const fence = fenceIsSafe(content, recorded) ? recorded : '```'
      const closing = fence === recorded && typeof node.attrs?.sourceClosingFence === 'string' ? node.attrs.sourceClosingFence : fence
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      const before = fence === recorded && typeof node.attrs?.sourceInfoBefore === 'string' ? node.attrs.sourceInfoBefore : ''
      const after = fence === recorded && typeof node.attrs?.sourceInfoAfter === 'string' ? node.attrs.sourceInfoAfter : ''
      return `${fence}${language ? `${before}${language}${after}` : ''}\n${content}\n${closing}`
    },
  })
}

function extendLink(extension: AnyExtension): AnyExtension {
  if (extension.name !== 'link') return extension
  return extension.extend({
    addAttributes(this: AttributeContext) {
      return { ...this.parent?.(), ...sourceFormAttrs(['sourceTitleQuote']) }
    },
    parseMarkdown(this: ParseContext, token: Token, helpers: MarkdownParseHelpers): JSONContent {
      return withAttrs(this.parent?.(token, helpers), { sourceTitleQuote: titleQuote(token.raw) }) as JSONContent
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
      const href = node.attrs?.href ?? ''
      const title = node.attrs?.title
      const content = helpers.renderChildren(node)
      if (typeof title !== 'string' || !title) return `[${content}](${href})`
      const quote = safeTitleQuote(title, node.attrs?.sourceTitleQuote)
      const close = quote === '(' ? ')' : quote
      return `[${content}](${href} ${quote}${title}${close})`
    },
  })
}

function orderedMarker(attrs: FormAttrs | undefined, index: number): string {
  const delimiter = attrs?.sourceOrderedDelimiter === ')' ? ')' : '.'
  const written = attrs?.sourceNumber
  const start = typeof attrs?.start === 'number' ? attrs.start : 1
  const number = typeof written === 'string' && /^\d{1,9}$/.test(written) ? written : String(start + index)
  return `${number}${delimiter} `
}

function extendListItem(extension: AnyExtension): AnyExtension {
  if (extension.name !== 'listItem') return extension
  return extension.extend({
    addAttributes(this: AttributeContext) {
      return { ...this.parent?.(), ...sourceFormAttrs(['sourceNumber']) }
    },
    parseMarkdown(this: ParseContext, token: Token, helpers: MarkdownParseHelpers): JSONContent {
      const parsed: unknown = this.parent?.(token, helpers)
      return withAttrs(parsed, { sourceNumber: /^\s*(\d+)[.)]/.exec(token.raw ?? '')?.[1] ?? null }) as JSONContent
    },
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers, context: RenderContext) {
      return renderNestedMarkdownContent(
        node,
        helpers,
        () => {
          if (context.parentType === 'bulletList') return `${context.meta?.parentAttrs?.sourceBulletMarker ?? '-'} `
          if (context.parentType === 'orderedList') return orderedMarker({ ...context.meta?.parentAttrs, ...node.attrs }, context.index ?? 0)
          return '- '
        },
        context,
        { alignNestedToPrefix: context.parentType === 'orderedList' },
      )
    },
  })
}

export function sourceFormStarterExtensions(extensions: AnyExtension[]): AnyExtension[] {
  return extensions.map((extension) => {
    const inline = extendInlineForm(extension)
    const heading = extendHeading(inline)
    const hardBreak = extendHardBreak(heading)
    const codeBlock = extendCodeBlock(hardBreak)
    const link = extendLink(codeBlock)
    return extendListItem(link)
  })
}

export function sourceListAttrs(raw: string, ordered = false): FormAttrs {
  const marker = /^\s*([-+*]|\d+([.)]))/.exec(raw)
  return ordered ? { sourceOrderedDelimiter: marker?.[2] ?? null } : { sourceBulletMarker: marker?.[1] && /^[-+*]$/.test(marker[1]) ? marker[1] : null }
}

export const listSourceAttributes = {
  sourceBulletMarker: hidden(),
  sourceOrderedDelimiter: hidden(),
}

export function taskItemSourceExtension(extension: AnyExtension): AnyExtension {
  return extension.extend({
    renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers, context) {
      const checked = node.attrs?.checked ? 'x' : ' '
      const marker = context.meta?.parentAttrs?.sourceBulletMarker ?? '-'
      return renderNestedMarkdownContent(node, helpers, `${marker} [${checked}] `)
    },
  })
}

export function tableSourceExtension(extension: AnyExtension): AnyExtension {
  if (extension.name !== 'table') return extension
  return extension.extend({
    addAttributes(this: AttributeContext) {
      return { ...this.parent?.(), ...sourceFormAttrs(['sourceDelimiter', 'sourceColumns']) }
    },
    parseMarkdown(this: ParseContext, token: Token, helpers: MarkdownParseHelpers): JSONContent {
      const parsed = this.parent?.(token, helpers) as JSONContent
      const source = tableLines(token.raw ?? '')
      const content = parsed.content?.map((row, index) => ({
        ...row,
        attrs: { ...row.attrs, sourceRow: source.rows[index] ?? null, sourceSignature: rowSignature(row) },
      }))
      return { ...parsed, attrs: { ...parsed.attrs, sourceDelimiter: source.delimiter, sourceColumns: source.columns }, content }
    },
    renderMarkdown(this: MarkdownRenderContext, node: JSONContent, helpers: MarkdownRendererHelpers, context: RenderContext) {
      const normalized = this.parent?.(node, helpers, context) ?? ''
      const lines = normalized.trim().split('\n')
      const rows = node.content ?? []
      const bodyLines = [lines[0] ?? '', ...lines.slice(2)]
      for (const [index, row] of rows.entries()) {
        if (typeof row.attrs?.sourceRow === 'string' && row.attrs.sourceSignature === rowSignature(row)) bodyLines[index] = row.attrs.sourceRow
        else if (typeof row.attrs?.sourceRow === 'string' && typeof row.attrs.sourceSignature === 'string') {
          bodyLines[index] = changedRow(row.attrs.sourceRow, bodyLines[index] ?? '', row.attrs.sourceSignature, row)
        }
      }
      const columns = rows[0]?.content?.length ?? 0
      const delimiter = node.attrs?.sourceColumns === columns && typeof node.attrs.sourceDelimiter === 'string' ? node.attrs.sourceDelimiter : (lines[1] ?? '')
      return [bodyLines[0] ?? '', delimiter, ...bodyLines.slice(1)].join('\n')
    },
  })
}

export const tableRowSourceAttributes = {
  sourceRow: hidden(),
  sourceSignature: hidden(),
}
