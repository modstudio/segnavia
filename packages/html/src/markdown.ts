import { type PageBody, resolveDirection } from '@segnavia/format'
import rehypeStringify from 'rehype-stringify'
import remarkDirective from 'remark-directive'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { parse as parseYaml } from 'yaml'
import { sanitize, type UrlPolicy } from './sanitize.ts'

export type MarkdownHeading = { id: string; level: number; title: string }
export type AlertKind = 'note' | 'tip' | 'important' | 'warning' | 'caution'
export type AlertLabels = Record<AlertKind, string>

export const alertLabels: Readonly<Record<'en' | 'he', AlertLabels>> = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  he: { note: 'הערה', tip: 'עצה', important: 'חשוב', warning: 'אזהרה', caution: 'זהירות' },
}

export interface BodyHtmlOptions {
  alertLabels?: Partial<AlertLabels>
  dir?: 'ltr' | 'rtl' | 'auto'
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

const MARKDOWN_URL_POLICY: UrlPolicy = {
  linkProtocols: ['https:', 'http:', 'mailto:'],
  imageProtocols: ['https:', 'http:'],
  linkFragments: true,
  dataImages: true,
}

const GEOMETRY_STYLE =
  '<style>:where([data-segnavia-overflow]){max-inline-size:100%;overflow-x:auto}:where([data-segnavia-overflow]>table){inline-size:max-content;min-inline-size:100%}@media print{:where([data-segnavia-overflow]){overflow-x:visible}:where([data-segnavia-overflow]>table){inline-size:100%;max-inline-size:100%;min-inline-size:0}:where([data-segnavia-overflow]>pre){white-space:pre-wrap}}</style>'

const memo = new WeakMap<object, Map<string, string>>()

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
  return Object.keys(properties).length === 0 ? [] : propertyList(properties, new Set([properties])).children ?? []
}

function visibleText(node: Node): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? ''
  return (node.children ?? []).map(visibleText).join('')
}

function slug(title: string): string {
  return (
    title
      .trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

function directiveSource(node: Node, source: string): string {
  const start = node.position?.start.offset
  const end = node.position && 'end' in node.position ? (node.position as unknown as { end?: { offset?: number } }).end?.offset : undefined
  return start === undefined || end === undefined ? `:${node.name ?? ''}` : source.slice(start, end)
}

function markdownPlugin(outline: MarkdownHeading[], labels: AlertLabels) {
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value)
    const seen = new Map<string, number>()
    const visit = (node: Node) => {
      if (node.type === 'yaml' && typeof node.value === 'string') {
        node.type = 'paragraph'
        node.children = []
        node.data = { hName: 'dl', hProperties: { dataSegnaviaFrontmatter: '' }, hChildren: frontmatter(node.value) }
      } else if (node.type === 'heading' && node.depth) {
        const title = visibleText(node)
        const base = slug(title)
        const count = seen.get(base) ?? 0
        seen.set(base, count + 1)
        const id = count === 0 ? base : `${base}-${count + 1}`
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } }
        outline.push({ id, level: node.depth, title })
      } else if (node.type === 'containerDirective') {
        const attributes = Object.fromEntries(
          Object.entries(node.attributes ?? {}).map(([name, value]) => [
            `dataSegnaviaDirective${name.charAt(0).toUpperCase()}${name.slice(1).replace(/[^a-zA-Z0-9]+(.)/g, (_, next: string) => next.toUpperCase())}`,
            value ?? '',
          ]),
        )
        node.data = { hName: 'div', hProperties: { dataSegnaviaDirective: node.name ?? '', ...attributes } }
      } else if (node.type === 'blockquote') {
        const first = node.children?.[0]?.children?.find((child) => child.type === 'text')
        const match = first ? /^\[!([A-Za-z]+)\](?:\r?\n|\s*)/.exec(first.value ?? '') : null
        const kind = match?.[1]?.toLowerCase() as AlertKind | undefined
        if (kind && Object.hasOwn(labels, kind)) {
          first!.value = (first!.value ?? '').slice(match![0].length)
          node.data = { hName: 'div', hProperties: { dataSegnaviaAlert: kind } }
          node.children = [{ type: 'paragraph', children: [{ type: 'text', value: labels[kind] }], data: { hName: 'bdi' } }, ...(node.children ?? [])]
        }
      }
      if (node.children) {
        node.children = node.children.map((child) =>
          child.type === 'textDirective' || child.type === 'leafDirective' ? { type: 'text', value: directiveSource(child, source) } : child,
        )
        for (const child of node.children) visit(child)
      }
    }
    visit(tree)
  }
}

function alertLanguage(markdown: string, options: BodyHtmlOptions): 'en' | 'he' {
  const primary = options.lang?.trim().toLowerCase().split(/[-_]/)[0]
  if (primary === 'he') return 'he'
  return resolveDirection(options.dir, options.lang, markdown) === 'rtl' ? 'he' : 'en'
}

function hastPlugin() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      for (const child of node.children ?? []) visit(child)
      if (node.type !== 'element') return
      if (node.tagName === 'pre') {
        const code = node.children?.[0]
        const classes = Array.isArray(code?.properties?.className) ? code.properties.className.map(String) : []
        if (classes.includes('language-mermaid')) node.properties = { ...node.properties, dataSegnaviaDiagram: 'mermaid' }
        else wrap(node)
      }
      if (node.tagName === 'table') wrap(node)
    }
    const wrap = (node: HastNode) => {
      const copy = { ...node, children: node.children }
      node.tagName = 'div'
      node.properties = { dataSegnaviaOverflow: '' }
      node.children = [copy]
    }
    visit(tree)
  }
}

function convert(markdown: string, options: BodyHtmlOptions): { html: string; outline: MarkdownHeading[] } {
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
  return { html: `${GEOMETRY_STYLE}${sanitize(String(result), { urlPolicy: MARKDOWN_URL_POLICY, disabledCheckboxes: true })}`, outline }
}

function optionKey(options: BodyHtmlOptions): string {
  return JSON.stringify([options.dir, options.lang, options.alertLabels])
}

export function bodyHtml(body: PageBody, options: BodyHtmlOptions = {}): string {
  if ('html' in body) return body.html
  let entries = memo.get(body)
  if (!entries) {
    entries = new Map()
    memo.set(body, entries)
  }
  const key = optionKey(options)
  const found = entries.get(key)
  if (found !== undefined) return found
  const html = convert(body.markdown, options).html
  entries.set(key, html)
  return html
}

export function markdownOutline(markdown: string): MarkdownHeading[] {
  return convert(markdown, {}).outline
}
