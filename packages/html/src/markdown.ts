import { type Direction, type Page, type PageBody, resolveDirection } from '@segnavia/format'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { parse as parseYaml } from 'yaml'
import { MARKDOWN_CONVERTER_POLICY } from './markdown-policy.ts'
import { sanitize } from './sanitize.ts'

export type MarkdownHeading = { id: string; level: number; title: string }
export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution'
export type AlertLabels = Record<AlertKind, string>

export const alertLabels: Readonly<Record<'en' | 'he', AlertLabels>> = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  he: { note: 'הערה', tip: 'עצה', important: 'חשוב', warning: 'אזהרה', caution: 'זהירות' },
}

function alertMarker(value: string): { kind: AlertKind; length: number } | undefined {
  const match = /^\[!([A-Za-z]+)\](?:\r?\n|\s*)/.exec(value)
  const kind = match?.[1]?.toLowerCase() as AlertKind | undefined
  return kind && match && Object.hasOwn(alertLabels.en, kind) ? { kind, length: match[0].length } : undefined
}

/** Whether the reader recognizes a blockquote source as a GitHub alert. */
export function isGithubAlertBlock(raw: string): boolean {
  const content = raw
    .split('\n')
    .map((line) => /^ {0,3}>[ \t]?(.*)$/.exec(line)?.[1] ?? '')
    .find((line) => line.trim() !== '')
  return Boolean(content && alertMarker(content))
}

/** Whether the reader turns a fenced language into a diagram placeholder. */
export function isDiagramFence(language: string | undefined): boolean {
  return (language ?? '').trim().split(/[ \t]/, 1)[0]?.toLowerCase() === 'mermaid'
}

export interface BodyHtmlOptions {
  alertLabels?: Partial<AlertLabels>
  dir?: Direction
  lang?: string
}

type Node = {
  type: string
  value?: string
  depth?: number
  name?: string
  lang?: string | null
  attributes?: Record<string, string | null | undefined> | null
  children?: Node[]
  data?: { hName?: string; hProperties?: Record<string, unknown>; hChildren?: HastNode[] }
  position?: { start: { offset?: number } }
}

type HastNode = {
  type: 'element' | 'text'
  tagName?: string
  properties?: Record<string, unknown>
  value?: string
  children?: HastNode[]
}

const GEOMETRY_STYLE =
  '<style>:where([data-segnavia-overflow]){max-inline-size:100%;overflow-x:auto}:where([data-segnavia-overflow]>table){inline-size:max-content;min-inline-size:100%}@media print{:where([data-segnavia-overflow]){overflow-x:visible}:where([data-segnavia-overflow]>table){inline-size:100%;max-inline-size:100%;min-inline-size:0}:where([data-segnavia-overflow]>pre){white-space:pre-wrap}}</style>'

type MarkdownResult = { html: string; outline: MarkdownHeading[] }

const memo = new WeakMap<object, Map<string, MarkdownResult>>()

function textNode(value: string): HastNode {
  return { type: 'text', value }
}

function element(tagName: string, children: HastNode[], properties?: Record<string, unknown>): HastNode {
  return { type: 'element', tagName, properties, children }
}

function propertyValue(value: unknown, ancestors: ReadonlySet<object>): HastNode[] {
  if (typeof value === 'boolean') return [textNode(value ? 'yes' : 'no')]
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return [textNode('(cycle)')]
    const next = new Set(ancestors).add(value)
    return value.flatMap((item) => [element('span', propertyValue(item, next))])
  }
  if (value !== null && typeof value === 'object') {
    if (ancestors.has(value)) return [textNode('(cycle)')]
    return [propertyList(value as Record<string, unknown>, new Set(ancestors).add(value))]
  }
  return [textNode(value == null ? '' : String(value))]
}

function propertyList(properties: Record<string, unknown>, ancestors: ReadonlySet<object>): HastNode {
  return element(
    'dl',
    Object.entries(properties).flatMap(([key, value]) => [element('dt', [textNode(key)]), element('dd', propertyValue(value, ancestors))]),
  )
}

function unreadableFrontmatter(source: string): HastNode[] {
  return [element('p', [textNode('Frontmatter could not be read.')]), element('pre', [element('code', [textNode(`---\n${source}\n---`)])])]
}

function frontmatter(source: string): HastNode[] {
  let value: unknown
  try {
    value = parseYaml(source)
  } catch {
    return unreadableFrontmatter(source)
  }
  if (value == null) return []
  if (typeof value !== 'object' || Array.isArray(value)) return unreadableFrontmatter(source)
  const properties = value as Record<string, unknown>
  return Object.keys(properties).length === 0 ? [] : (propertyList(properties, new Set([properties])).children ?? [])
}

function visibleText(node: Node): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? ''
  return (node.children ?? []).map(visibleText).join('')
}

function slug(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

function directiveSource(node: Node, source: string): string {
  const start = node.position?.start.offset
  const end = node.position && 'end' in node.position ? (node.position as unknown as { end?: { offset?: number } }).end?.offset : undefined
  return start === undefined || end === undefined ? `:${node.name ?? ''}` : source.slice(start, end)
}

function applyFrontmatter(node: Node): void {
  if (node.type !== 'yaml' || typeof node.value !== 'string') return
  node.type = 'paragraph'
  node.children = []
  node.data = { hName: 'dl', hProperties: { dataSegnaviaFrontmatter: '' }, hChildren: frontmatter(node.value) }
}

function applyHeading(node: Node, seen: Map<string, number>, outline: MarkdownHeading[]): void {
  if (node.type !== 'heading' || !node.depth) return
  const title = visibleText(node)
  const base = slug(title)
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  const id = count === 0 ? base : `${base}-${count + 1}`
  node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
  outline.push({ id, level: node.depth, title })
}

function applyDirective(node: Node): void {
  if (node.type !== 'containerDirective') return
  const attributes = Object.fromEntries(
    Object.entries(node.attributes ?? {}).map(([name, value]) => [
      `dataSegnaviaDirective${name.charAt(0).toUpperCase()}${name.slice(1).replace(/[^a-zA-Z0-9]+(.)/g, (_, next: string) => next.toUpperCase())}`,
      value ?? '',
    ]),
  )
  node.data = { hName: 'div', hProperties: { dataSegnaviaDirective: node.name ?? '', ...attributes } }
}

function applyAlert(node: Node, labels: AlertLabels): void {
  if (node.type !== 'blockquote') return
  const first = node.children?.[0]?.children?.find((child) => child.type === 'text')
  if (!first) return
  const marker = alertMarker(first.value ?? '')
  if (!marker) return
  const { kind } = marker
  first.value = (first.value ?? '').slice(marker.length)
  node.data = { hName: 'div', hProperties: { dataSegnaviaAlert: kind } }
  node.children = [{ type: 'paragraph', children: [{ type: 'text', value: labels[kind] }], data: { hName: 'bdi' } }, ...(node.children ?? [])]
}

function literalDirectives(node: Node, source: string): void {
  if (!node.children) return
  node.children = node.children.map((child) =>
    child.type === 'textDirective' || child.type === 'leafDirective' ? { type: 'text', value: directiveSource(child, source) } : child,
  )
}

function markdownPlugin(outline: MarkdownHeading[], labels: AlertLabels) {
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value)
    const seen = new Map<string, number>()
    const visit = (node: Node) => {
      applyFrontmatter(node)
      applyHeading(node, seen, outline)
      applyDirective(node)
      applyAlert(node, labels)
      literalDirectives(node, source)
      for (const child of node.children ?? []) visit(child)
    }
    visit(tree)
  }
}

function alertLanguage(markdown: string, options: BodyHtmlOptions): 'en' | 'he' {
  const primary = options.lang?.trim().toLowerCase().split(/[-_]/)[0]
  if (primary === 'en' || primary === 'he') return primary
  const text = markdown.replace(/^>\s*\[![A-Za-z]+\]\s*$/gm, '')
  return resolveDirection(options.dir, options.lang, text) === 'rtl' ? 'he' : 'en'
}

function hastPlugin() {
  return (tree: HastNode) => {
    const wrap = (node: HastNode) => {
      const copy = { ...node, children: node.children }
      node.tagName = 'div'
      node.properties = { dataSegnaviaOverflow: '' }
      node.children = [copy]
    }
    const transform = (node: HastNode) => {
      if (node.type !== 'element') return
      if (node.tagName === 'table') wrap(node)
      if (node.tagName !== 'pre') return
      const code = node.children?.[0]
      const classes = Array.isArray(code?.properties?.className) ? code.properties.className.map(String) : []
      if (classes.some((name) => name.startsWith('language-') && isDiagramFence(name.slice('language-'.length))))
        node.properties = { ...node.properties, dataSegnaviaDiagram: 'mermaid' }
      else wrap(node)
    }
    const visit = (node: HastNode) => {
      for (const child of node.children ?? []) visit(child)
      transform(node)
    }
    visit(tree)
  }
}

function convert(markdown: string, options: BodyHtmlOptions): MarkdownResult {
  const outline: MarkdownHeading[] = []
  const language = alertLanguage(markdown, options)
  const labels = { ...alertLabels[language], ...options.alertLabels }
  const result = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkDirective)
    .use(markdownPlugin, outline, labels)
    .use(remarkRehype)
    .use(hastPlugin)
    .use(rehypeStringify)
    .processSync(markdown)
  return { html: `${GEOMETRY_STYLE}${sanitize(String(result), { converterPolicy: MARKDOWN_CONVERTER_POLICY })}`, outline }
}

function optionKey(options: BodyHtmlOptions): string {
  return JSON.stringify([options.dir, options.lang, options.alertLabels])
}

function markdownResult(body: Extract<PageBody, { markdown: string }>, options: BodyHtmlOptions): MarkdownResult {
  let entries = memo.get(body)
  if (!entries) {
    entries = new Map()
    memo.set(body, entries)
  }
  const key = optionKey(options)
  const found = entries.get(key)
  if (found !== undefined) return found
  const result = convert(body.markdown, options)
  entries.set(key, result)
  return result
}

function outlinedMarkdownResult(body: Extract<PageBody, { markdown: string }>): MarkdownResult {
  const existing = memo.get(body)?.values().next().value
  return existing ?? markdownResult(body, {})
}

export function bodyHtml(body: PageBody, options: BodyHtmlOptions = {}): string {
  return 'html' in body ? body.html : markdownResult(body, options).html
}

export function markdownOutline(markdown: string | Extract<PageBody, { markdown: string }>): MarkdownHeading[] {
  const body = typeof markdown === 'string' ? { markdown } : markdown
  return outlinedMarkdownResult(body).outline
}

export type HtmlPage = Omit<Page, 'body'> & { html: string }

export function resolvePageHtml(page: Page, options: Pick<BodyHtmlOptions, 'alertLabels'>): HtmlPage
export function resolvePageHtml(page: Page): HtmlPage
export function resolvePageHtml(page: Page, options: Pick<BodyHtmlOptions, 'alertLabels'> = {}): HtmlPage {
  const { body, ...fields } = page
  return { ...fields, html: bodyHtml(body, { dir: page.dir, lang: page.lang, alertLabels: options.alertLabels }) }
}
