import {
  BOOK_PARENT_NAMES,
  type Book,
  type BookView,
  type BookViewPagination,
  formatNumber,
  PRINTED_PAGE_LIMIT,
  PX_PER_MM,
  resolveParentPages,
} from '@segnavia/format'
import { bookStylesheet } from '@segnavia/html'
import { BOOK_COMPOSED_ATTRIBUTE, composerScript } from './book-composer.ts'
import type { BookLayout } from './book-presentation.ts'
import { frameDocument } from './bridge.ts'

export interface PaginatedDocumentOptions {
  nonce: string
  fontCss?: string
  css?: string
  printBackground?: boolean
  screen?: { spread: boolean; layout: BookLayout }
}

function scopedBuildStyle(html: string, root: string, limit?: string): string {
  const boundary = limit ? ` to (${limit})` : ''
  return html.replace(/<style>([\s\S]*?)<\/style>/i, (_tag, css: string) => `<style>@scope (${root})${boundary}{${css}}</style>`)
}

function px(value: number): number {
  return value * PX_PER_MM
}

function folios(system: Book['numbering']['body']): string[] {
  return Array.from({ length: PRINTED_PAGE_LIMIT }, (_, index) => formatNumber(index + 1, system))
}

export function paginatedViewDocument(view: BookView, pagination: BookViewPagination, options: PaginatedDocumentOptions): string {
  const parents = resolveParentPages(pagination.parents).map((parent) => ({
    ...parent,
    margin: {
      top: px(parent.margin.top),
      bottom: px(parent.margin.bottom),
      inner: px(parent.margin.inner),
      outer: px(parent.margin.outer),
    },
  }))
  const config = {
    direction: pagination.direction,
    dir: view.dir,
    lang: view.lang,
    geometry: {
      paperWidth: px(pagination.paper.width),
      paperHeight: px(pagination.paper.height),
      textWidth: px(pagination.paper.width - pagination.margin.inner - pagination.margin.outer),
      textHeight: px(pagination.paper.height - pagination.margin.top - pagination.margin.bottom),
      columnGap: px(pagination.columnGap),
      notesGap: 9,
    },
    orphans: pagination.orphans,
    widows: pagination.widows,
    rectoOpenings: pagination.rectoOpenings,
    endnotePlacement: pagination.endnotePlacement,
    runningHead: pagination.runningHead,
    contentsPageNumbers: pagination.contents.pageNumbers,
    parents,
    parentNames: BOOK_PARENT_NAMES,
    folios: { front: folios(pagination.numbering.frontMatter), body: folios(pagination.numbering.body) },
    limit: PRINTED_PAGE_LIMIT,
    ...(options.screen ? { screen: options.screen } : {}),
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c')
  const bookCss = bookStylesheet(options.fontCss, view.css, options.css)
  const css =
    `@page{size:${pagination.paper.width}mm ${pagination.paper.height}mm;margin:0}` +
    `:where(html,body){margin:0!important;padding:0!important}` +
    `:where(html:not([${BOOK_COMPOSED_ATTRIBUTE}]),html:not([${BOOK_COMPOSED_ATTRIBUTE}]) body){block-size:0!important;min-block-size:0!important}` +
    `:where([data-segnavia-galleys]){position:absolute;inset-block-start:0;inset-inline-start:0}` +
    `:where([data-segnavia-pages]){inline-size:${pagination.paper.width}mm}` +
    `:where([data-segnavia-book-page]:last-child){break-after:auto}` +
    `@media print{:where([data-segnavia-galley-source]){display:none!important}}` +
    bookCss
  const galley = options.screen ? scopedBuildStyle(view.html, ':root', '[data-segnavia-flow-view]') : view.html
  const flow = options.screen && view.flow ? `<template data-segnavia-flow-build>${scopedBuildStyle(view.flow, '[data-segnavia-flow-view]')}</template>` : ''
  const body = `${galley}${flow}<script nonce="${options.nonce}">${composerScript(json)}</script>`
  return frameDocument(body, {
    scripts: 'refuse',
    nonce: options.nonce,
    dir: pagination.direction,
    lang: view.lang,
    css,
    relayKeys: false,
    reportHeight: false,
    readyAfterAttribute: BOOK_COMPOSED_ATTRIBUTE,
    printBackground: options.printBackground,
  })
}
