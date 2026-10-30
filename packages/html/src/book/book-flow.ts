import { type Book, bookSections, isPart, MAX_PART_DEPTH, PX_PER_MM, sheetMm } from '@segnavia/format'
import type { Element } from 'domhandler'
import { isTag } from 'domhandler'
import type { BookBuild } from './types.ts'

export const BOOK_FLOW_COLUMN_MIN_PX = 240
export const BOOK_COLUMN_MIN = 2
export const BOOK_COLUMN_MAX = 4

// The front/body selectors here agree with bookPrintPart, the source of print membership.
const CONTENTS_INDENTS = Array.from({ length: 5 }, (_, index) => index + 2)
  .map((level) => `:where(.segnavia-contents-entry[data-level="${level}"]){padding-inline-start:${level - 1}em}`)
  .join('')
const DEEP_CONTENTS_INDENTS = Array.from({ length: MAX_PART_DEPTH }, (_, index) => index + 7)
  .map((level) => `:where(.segnavia-contents-entry[data-level="${level}"]){padding-inline-start:${level - 1}em}`)
  .join('')
const CONTENTS_PREFIX = `:where(.segnavia-contents-list){list-style:none;padding:0;margin:0}:where(.segnavia-contents-entry){display:flex}:where(.segnavia-contents-page){margin-inline-start:auto}${CONTENTS_INDENTS}`
const CONTENTS_SUFFIX = ':where(.segnavia-targets){position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}'
const GALLEY_SUFFIX =
  ':where([data-segnavia-galleys]){position:relative}:where([data-segnavia-flow]){orphans:inherit;widows:inherit}:where([data-segnavia-kind="fixed"],[data-segnavia-kind="templated"],[data-segnavia-template]){display:none}:where([data-segnavia-notes-galley]){border-block-start:1px solid;padding-block-start:8px}:where([data-segnavia-note]){break-inside:avoid}:where([data-segnavia-galleys] img,[data-segnavia-window] img,[data-segnavia-page-note] img){display:block;max-block-size:var(--segnavia-text-height);max-inline-size:100%;block-size:auto;inline-size:auto}'

function hasParts(book: Book): boolean {
  return bookSections(book).some(({ entry }) => isPart(entry))
}

function contentsCss(book: Book): string {
  return `${CONTENTS_PREFIX}${hasParts(book) ? DEEP_CONTENTS_INDENTS : ''}${CONTENTS_SUFFIX}`
}

function printCss(book: Book): string {
  const breaks = hasParts(book) ? '.segnavia-part,.segnavia-chapter,.segnavia-endnotes,.segnavia-blank' : '.segnavia-chapter,.segnavia-endnotes,.segnavia-blank'
  return `${contentsCss(book)}@media print{:where(.segnavia-front,.segnavia-contents)~:where(.segnavia-front,.segnavia-contents),:where(${breaks}){break-before:page}:where(.segnavia-blank){break-after:page}}`
}

export interface BookFlowPageGeometry {
  paperInline: number
  paperBlock: number
  textInline: number
  textBlock: number
  marginBlockStart: number
  marginInlineStartRecto: number
  marginInlineStartVerso: number
}

export function bookFlowPageGeometry(book: Book): BookFlowPageGeometry | undefined {
  if (!book.page) return undefined
  const paper = sheetMm(book.page)
  return {
    paperInline: paper.width * PX_PER_MM,
    paperBlock: paper.height * PX_PER_MM,
    textInline: (paper.width - book.page.margin.inner - book.page.margin.outer) * PX_PER_MM,
    textBlock: (paper.height - book.page.margin.top - book.page.margin.bottom) * PX_PER_MM,
    marginBlockStart: book.page.margin.top * PX_PER_MM,
    marginInlineStartRecto: book.page.margin.inner * PX_PER_MM,
    marginInlineStartVerso: book.page.margin.outer * PX_PER_MM,
  }
}

function columnFallbacks(gap: number): string {
  return Array.from({ length: BOOK_COLUMN_MAX - BOOK_COLUMN_MIN + 1 }, (_, index) => index + BOOK_COLUMN_MIN)
    .map((count) => {
      const threshold = count * BOOK_FLOW_COLUMN_MIN_PX + (count - 1) * gap
      return `@container (max-width:${threshold}px){:where([data-columns="${count}"]){column-count:1}}`
    })
    .join('')
}

function flowCss(book: Book): string {
  const gap = (book.page?.columnGap ?? 0) * PX_PER_MM
  const columns = Array.from({ length: BOOK_COLUMN_MAX - BOOK_COLUMN_MIN + 1 }, (_, index) => index + BOOK_COLUMN_MIN)
    .map((count) => `:where([data-columns="${count}"]){column-count:${count}}`)
    .join('')
  return `${contentsCss(book)}:where([data-segnavia-flow]){container-type:inline-size}:where([data-columns]){column-gap:${gap}px}${columns}:where([data-segnavia-flow-page]){inline-size:100%;container-type:inline-size;margin-inline:0}:where([data-segnavia-flow-page-size]){position:relative;inline-size:100cqi;block-size:calc(100cqi * var(--segnavia-paper-ratio));overflow:hidden}:where([data-segnavia-flow-paper]){position:absolute;inset-block-start:0;inset-inline-start:0;inline-size:var(--segnavia-paper-inline);block-size:var(--segnavia-paper-block);overflow:hidden;zoom:var(--segnavia-flow-scale,calc(100cqi / var(--segnavia-paper-inline)))}:where([data-segnavia-flow-text]){position:absolute;inset-block-start:var(--segnavia-text-block-start);inset-inline-start:var(--segnavia-text-inline-start);inline-size:var(--segnavia-text-inline);block-size:var(--segnavia-text-block);container-type:inline-size}${columnFallbacks(gap)}`
}

// A paginated book defaults to its galley and may also build its flow; a continuous book has only its print build.
export function resolveBookBuild(book: Book, requested: BookBuild | undefined): { build: BookBuild; issue?: string } {
  const build = requested ?? (book.mode === 'paginated' ? 'galley' : 'print')
  if (book.mode === 'paginated' || build === 'print') return { build }
  return { build, issue: `a continuous book cannot use the ${build} build; request the print build, or make the book paginated with a page to clear this` }
}

export function bookDocumentCss(book: Book, build: BookBuild): string {
  if (build === 'galley') return `${contentsCss(book)}${GALLEY_SUFFIX}`
  return build === 'flow' ? flowCss(book) : printCss(book)
}

export function flowPageStyle(geometry: BookFlowPageGeometry, recto: boolean): string {
  const marginInlineStart = recto ? geometry.marginInlineStartRecto : geometry.marginInlineStartVerso
  return `--segnavia-paper-inline:${geometry.paperInline}px;--segnavia-paper-block:${geometry.paperBlock}px;--segnavia-paper-ratio:${geometry.paperBlock / geometry.paperInline};--segnavia-text-inline:${geometry.textInline}px;--segnavia-text-block:${geometry.textBlock}px;--segnavia-text-block-start:${geometry.marginBlockStart}px;--segnavia-text-inline-start:${marginInlineStart}px`
}

export function bookBlockPosition(flowId: string, block: number, suffix?: string): string {
  return `${flowId}:${block}${suffix ? `:${suffix}` : ''}`
}

export interface BookPositionKey {
  flow: string
  index: number
  suffix?: string
}

export function parseBookPositionKey(value: string): BookPositionKey | undefined {
  const match = /^(.*):(\d+)(?::([^:]+))?$/.exec(value)
  if (!match?.[1] || !match[2]) return undefined
  return { flow: match[1], index: Number(match[2]), ...(match[3] ? { suffix: match[3] } : {}) }
}

function isFootnoteBlock(node: Element): boolean {
  return (node.attribs.class ?? '').split(/\s+/).includes('segnavia-footnotes')
}

interface PositionSection {
  info: { id: string }
  node: { children: Element['children'] }
}

export function markBlockPositions(sections: PositionSection[]): void {
  for (const section of sections) {
    let position = 0
    for (const child of section.node.children) {
      if (!isTag(child)) continue
      if (child.name === 'style' || child.name === 'script') continue
      if (isFootnoteBlock(child)) {
        child.attribs['data-segnavia-position'] = bookBlockPosition(section.info.id, position, 'footnotes')
        continue
      }
      position += 1
      child.attribs['data-segnavia-position'] = bookBlockPosition(section.info.id, position)
    }
  }
}
