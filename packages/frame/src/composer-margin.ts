import type { PreflightEntry } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { numberLines, resolveLineNumberSide } from '@segnavia/layout'

export const LINE_NUMBER_CSS =
  ':where([data-segnavia-line-numbers]){position:absolute;inset:0;pointer-events:none}:where([data-segnavia-line-number]){position:absolute;display:block;inline-size:max-content;white-space:nowrap;unicode-bidi:isolate;color:var(--segnavia-line-number-color,inherit);font-size:var(--segnavia-line-number-size,.8em)}:where([data-segnavia-line-numbers][data-segnavia-area="text"] [data-segnavia-side="left"]){translate:calc(-100% - var(--segnavia-line-number-gap,.75em)) 0}:where([data-segnavia-line-numbers][data-segnavia-area="text"] [data-segnavia-side="right"]){translate:var(--segnavia-line-number-gap,.75em) 0}:where([data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-side="left"]){translate:var(--segnavia-line-number-gap,.75em) 0}:where([data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-side="right"]){translate:calc(0px - var(--segnavia-line-number-gap,.75em)) 0}'

interface DrawConfig {
  area: 'text' | 'margin'
  direction: 'ltr' | 'rtl'
  geometries: Array<{ columnGap: number; parents: Array<{ name: string }> }>
  pageMarker: string
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function drawLineNumbers(
  numbered: ReturnType<typeof numberLines>,
  config: DrawConfig,
  entries: PreflightEntry[],
): void {
  var pages = document.querySelectorAll('[' + config.pageMarker + ']')
  for (var pageIndex = 0; pageIndex < numbered.length; pageIndex += 1) {
    var held = numbered[pageIndex]
    var page = pages[pageIndex] as HTMLElement | undefined
    if (!held || !page || held.lines.length === 0) continue
    var text = page.querySelector('[data-segnavia-text]') as HTMLElement | null
    if (!text) continue
    var container = document.createElement('div')
    container.setAttribute('data-segnavia-line-numbers', '')
    container.setAttribute('data-segnavia-area', config.area)
    container.setAttribute('aria-hidden', 'true')
    var textRect = text.getBoundingClientRect()
    var pageRect = page.getBoundingClientRect()
    var geometryName = page.getAttribute('data-segnavia-page-geometry')
    var geometry = config.geometries.find((candidate: { name?: string }) => (candidate.name ?? null) === geometryName) ?? config.geometries[0]
    var gap = geometry?.columnGap ?? 0
    for (var lineIndex = 0; lineIndex < held.lines.length; lineIndex += 1) {
      var line = held.lines[lineIndex]
      if (!line) continue
      var number = document.createElement('bdi')
      number.setAttribute('data-segnavia-line-number', String(line.value))
      number.setAttribute('data-segnavia-side', line.side)
      number.textContent = line.label
      number.style.top = line.top + 'px'
      number.style.lineHeight = line.height + 'px'
      var width = (textRect.width - (line.columns - 1) * gap) / line.columns
      var physicalColumn = config.direction === 'ltr' ? line.column : line.columns - line.column - 1
      if (config.area === 'margin') {
        if (line.side === 'left') number.style.left = pageRect.left - textRect.left + 'px'
        else number.style.right = textRect.right - pageRect.right + 'px'
      } else if (line.side === 'left') number.style.left = physicalColumn * (width + gap) + 'px'
      else number.style.right = textRect.width - (physicalColumn * (width + gap) + width) + 'px'
      container.append(number)
    }
    text.append(container)
    var furniture = page.querySelectorAll('[data-segnavia-region]')
    for (var drawnIndex = 0; drawnIndex < container.children.length; drawnIndex += 1) {
      var drawn = container.children[drawnIndex] as HTMLElement
      var source = held.lines[drawnIndex]
      if (!source) continue
      var rect = drawn.getBoundingClientRect()
      var crossed = rect.left < pageRect.left || rect.right > pageRect.right || rect.top < pageRect.top || rect.bottom > pageRect.bottom ? 'the page edge' : ''
      for (var regionIndex = 0; !crossed && regionIndex < furniture.length; regionIndex += 1) {
        var region = furniture[regionIndex] as HTMLElement
        if (intersects(rect, region.getBoundingClientRect())) crossed = 'region ' + (region.getAttribute('data-segnavia-region') || 'furniture')
      }
      if (!crossed && config.area === 'text' && source.columns > 1) {
        var interior = source.side === 'left' ? source.column > 0 : source.column < source.columns - 1
        if (interior && rect.width > gap) crossed = 'the column gap'
      }
      if (!crossed) continue
      var subject = 'line:' + source.value
      if (entries.some((entry) => entry.check === 'margin-overset' && entry.subject === subject && entry.location?.folio === (page.getAttribute('data-segnavia-folio') || ''))) continue
      entries.push({
        check: 'margin-overset',
        subject,
        message: 'Line number ' + source.value + ' crosses ' + crossed + '; change lineNumbers.area or lineNumbers.side, or widen the margin or column gap to clear it.',
        location: { folio: page.getAttribute('data-segnavia-folio') || '' },
      })
    }
  }
}

export function embeddedComposerMarginFunctions(): string {
  return `${embedFunction('resolveLineNumberSide', resolveLineNumberSide)}\n${embedFunction('numberLines', numberLines)}\n${embedFunction('intersects', intersects)}\n${embedFunction('drawLineNumbers', drawLineNumbers)}`
}
