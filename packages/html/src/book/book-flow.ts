import { type Book, PX_PER_MM, sheetMm } from '@segnavia/format'
import type { Element } from 'domhandler'
import { isTag } from 'domhandler'
import type { BuiltSection } from './book-held.ts'

export const BOOK_FLOW_COLUMN_MIN_PX = 240

// The front/body selectors here agree with bookPrintPart, the source of print membership.
const CONTENTS_CSS =
  ':where(.segnavia-contents-list){list-style:none;padding:0;margin:0}:where(.segnavia-contents-entry){display:flex}:where(.segnavia-contents-page){margin-inline-start:auto}:where(.segnavia-contents-entry[data-level="2"]){padding-inline-start:1em}:where(.segnavia-contents-entry[data-level="3"]){padding-inline-start:2em}:where(.segnavia-contents-entry[data-level="4"]){padding-inline-start:3em}:where(.segnavia-contents-entry[data-level="5"]){padding-inline-start:4em}:where(.segnavia-contents-entry[data-level="6"]){padding-inline-start:5em}'
const PRINT_CSS = `${CONTENTS_CSS}@media print{:where(.segnavia-front,.segnavia-contents)~:where(.segnavia-front,.segnavia-contents),:where(.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}:where(.segnavia-blank){break-after:page}:where(.segnavia-targets){position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}}`
const GALLEY_CSS = `${CONTENTS_CSS}:where([data-segnavia-galleys]){position:relative}:where([data-segnavia-flow]){orphans:inherit;widows:inherit}:where([data-segnavia-kind="fixed"],[data-segnavia-kind="templated"],[data-segnavia-template]){display:none}:where([data-segnavia-notes-galley]){border-block-start:1px solid;padding-block-start:8px}:where([data-segnavia-note]){break-inside:avoid}:where([data-segnavia-galleys] img,[data-segnavia-window] img,[data-segnavia-page-note] img){display:block;max-block-size:var(--segnavia-text-height);max-inline-size:100%;block-size:auto;inline-size:auto}`

export interface BookFlowPageGeometry {
  paperInline: number
  paperBlock: number
  textInline: number
  textBlock: number
  marginBlockStart: number
  marginInlineStart: number
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
    marginInlineStart: book.page.margin.inner * PX_PER_MM,
  }
}

function columnFallbacks(gap: number): string {
  return [2, 3, 4]
    .map((count) => {
      const threshold = count * BOOK_FLOW_COLUMN_MIN_PX + (count - 1) * gap
      return `@container (max-width:${threshold}px){:where([data-columns="${count}"]){column-count:1}}`
    })
    .join('')
}

function flowCss(book: Book): string {
  const gap = (book.page?.columnGap ?? 0) * PX_PER_MM
  return `${CONTENTS_CSS}:where([data-segnavia-flow]){container-type:inline-size}:where([data-columns]){column-gap:${gap}px}:where([data-columns="2"]){column-count:2}:where([data-columns="3"]){column-count:3}:where([data-columns="4"]){column-count:4}:where([data-segnavia-flow-page]){inline-size:100%;container-type:inline-size;margin-inline:0}:where([data-segnavia-flow-page-size]){position:relative;inline-size:100cqi;block-size:calc(100cqi * var(--segnavia-paper-block) / var(--segnavia-paper-inline));overflow:hidden}:where([data-segnavia-flow-paper]){position:absolute;inset-block-start:0;inset-inline-start:0;inline-size:var(--segnavia-paper-inline);block-size:var(--segnavia-paper-block);overflow:hidden;zoom:calc(100cqi / var(--segnavia-paper-inline))}:where([data-segnavia-flow-text]){position:absolute;inset-block-start:var(--segnavia-text-block-start);inset-inline-start:var(--segnavia-text-inline-start);inline-size:var(--segnavia-text-inline);block-size:var(--segnavia-text-block)}${columnFallbacks(gap)}`
}

export function bookDocumentCss(book: Book, galley: boolean): string {
  if (galley) return GALLEY_CSS
  return book.mode === 'paginated' ? flowCss(book) : PRINT_CSS
}

export function flowPageStyle(geometry: BookFlowPageGeometry): string {
  return `--segnavia-paper-inline:${geometry.paperInline}px;--segnavia-paper-block:${geometry.paperBlock}px;--segnavia-text-inline:${geometry.textInline}px;--segnavia-text-block:${geometry.textBlock}px;--segnavia-text-block-start:${geometry.marginBlockStart}px;--segnavia-text-inline-start:${geometry.marginInlineStart}px`
}

export function bookBlockPosition(flowId: string, block: number, suffix?: string): string {
  return `${flowId}:${block}${suffix ? `:${suffix}` : ''}`
}

function isFootnoteBlock(node: Element): boolean {
  return (node.attribs.class ?? '').split(/\s+/).includes('segnavia-footnotes')
}

export function markBlockPositions(sections: BuiltSection[]): void {
  for (const section of sections) {
    let position = 0
    for (const child of section.node.children) {
      if (!isTag(child)) continue
      if (isFootnoteBlock(child)) {
        child.attribs['data-segnavia-position'] = bookBlockPosition(section.info.id, position, 'footnotes')
        continue
      }
      position += 1
      child.attribs['data-segnavia-position'] = bookBlockPosition(section.info.id, position)
    }
  }
}
