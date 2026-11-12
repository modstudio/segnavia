import { resolveDirection, type TextDirection } from '@segnavia/format'
import type { Watermark, WatermarkPosition } from './watermark-options.ts'

export interface WatermarkPage {
  media: { width: number; height: number }
  trim: { x: number; y: number; width: number; height: number }
  direction: TextDirection
  lang?: string
  fontFamily?: string
}

const align = (position: WatermarkPosition | undefined) => (position === 'start' ? 'flex-start' : position === 'end' ? 'flex-end' : 'center')

function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function text(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cssString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\3c ')
}

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

function fontFamily(value: string): string {
  return value
    .split(',')
    .map((family) => {
      const trimmed = family.trim()
      return GENERIC_FAMILIES.has(trimmed.toLowerCase()) ? trimmed : cssString(trimmed)
    })
    .join(', ')
}

export function watermarkTextTargetWidth(size: number | undefined, trimWidth: number): number {
  return (size ?? 0.6) * trimWidth
}

function styleText(value: string): string {
  return value.replace(/</g, '\\3c ')
}

export function watermarkDirection(watermark: Watermark, page: WatermarkPage): TextDirection {
  if (watermark.dir !== undefined || watermark.lang !== undefined) return resolveDirection(watermark.dir, watermark.lang, watermark.text ?? '')
  return page.direction
}

export function watermarkRotation(watermark: Watermark, page: WatermarkPage): number {
  if (typeof watermark.rotation === 'number') return watermark.rotation
  const angle = (Math.atan2(page.trim.height, page.trim.width) * 180) / Math.PI
  return watermarkDirection(watermark, page) === 'rtl' ? angle : -angle
}

export function watermarkMarkup(watermark: Watermark, page: WatermarkPage): string {
  const direction = watermarkDirection(watermark, page)
  const family = watermark.font === undefined ? page.fontFamily : fontFamily(watermark.font)
  const width = watermarkTextTargetWidth(watermark.size, page.trim.width)
  const top = page.media.height - page.trim.y - page.trim.height
  const box = [
    'position:absolute',
    `left:${page.trim.x}pt`,
    `top:${top}pt`,
    `width:${page.trim.width}pt`,
    `height:${page.trim.height}pt`,
    'display:flex',
    `justify-content:${align(watermark.position?.inline)}`,
    `align-items:${align(watermark.position?.block)}`,
    'overflow:hidden',
  ].join(';')
  const mark = [
    `inline-size:${width}pt`,
    'max-inline-size:100%',
    'text-align:center',
    'white-space:nowrap',
    'transform-origin:center',
    `transform:rotate(${watermarkRotation(watermark, page)}deg)`,
    `opacity:${watermark.opacity ?? 0.15}`,
    `color:${watermark.color ?? '#777'}`,
    ...(family ? [`font-family:${family}`] : []),
  ].join(';')
  const language = watermark.lang ?? page.lang
  const attributes = ` dir="${direction}"${language ? ` lang="${attribute(language)}"` : ''}`
  const content =
    watermark.text !== undefined
      ? `<bdi${attributes}>${text(watermark.text)}</bdi>`
      : `<img${attributes} src="${attribute(watermark.image ?? '')}" alt="" style="display:block;inline-size:100%;block-size:auto">`
  return `<div class="segnavia-watermark-page" dir="${direction}" style="${attribute(box)}"><div class="segnavia-watermark" style="${attribute(mark)}">${content}</div></div>`
}

export function watermarkDocument(watermark: Watermark, pages: readonly WatermarkPage[], css = ''): string {
  const pageRules = pages
    .map(
      (page, index) =>
        `@page segnavia-watermark-${index + 1}{size:${page.media.width}pt ${page.media.height}pt;margin:0}` +
        `.segnavia-watermark-sheet:nth-of-type(${index + 1}){page:segnavia-watermark-${index + 1};width:${page.media.width}pt;height:${page.media.height}pt}`,
    )
    .join('')
  const sheets = pages.map((page) => `<section class="segnavia-watermark-sheet">${watermarkMarkup(watermark, page)}</section>`).join('')
  return `<!doctype html><html><head><style>${styleText(css)}${pageRules}html,body{margin:0;background:transparent}.segnavia-watermark-sheet{position:relative;break-after:page;overflow:hidden}</style></head><body>${sheets}</body></html>`
}
