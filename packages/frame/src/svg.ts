// Draws measured annotations as SVG in the shot's own CSS pixels, so the same
// markup serves the live viewer (one group shown per cue) and print (all of
// them). Pure string building: it runs in a browser and on a server alike.

import { type Annotation, firstStrongDirection, type Size } from '@segnavia/format'

export const ANNOTATION_COLOR = '#e5484d'

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

// A label reads in the direction of its own first letter, so a Hebrew label
// on an English screen, or the reverse, keeps its words in order.
function labelText(label: string, at: { x: number; y: number }, color: string): string {
  const direction = firstStrongDirection(label) ?? 'ltr'
  return `<text x="${at.x}" y="${at.y - 10}" fill="${color}" direction="${direction}" unicode-bidi="isolate" font-family="system-ui,sans-serif" font-size="18" font-weight="600" text-anchor="middle">${escapeHtml(label)}</text>`
}

export function annotationGroup(annotation: Annotation, index: number, color = ANNOTATION_COLOR): string {
  const { ring, arrow, badge } = annotation
  const parts = [
    ring ? `<rect x="${ring.x}" y="${ring.y}" width="${ring.width}" height="${ring.height}" rx="8" fill="none" stroke="${color}" stroke-width="3"/>` : '',
    arrow
      ? `<line x1="${arrow.tail.x}" y1="${arrow.tail.y}" x2="${arrow.head.x}" y2="${arrow.head.y}" stroke="${color}" stroke-width="3" marker-end="url(#segnavia-head)"/>` +
        (arrow.label ? labelText(arrow.label, arrow.tail, color) : '')
      : '',
    badge
      ? `<circle cx="${badge.center.x}" cy="${badge.center.y}" r="15" fill="${color}"/><text x="${badge.center.x}" y="${badge.center.y + 5}" fill="#fff" font-family="system-ui,sans-serif" font-size="15" font-weight="700" text-anchor="middle">${badge.number}</text>`
      : '',
  ]
  return `<g data-annotation="${index}">${parts.join('')}</g>`
}

export function annotationSvg(size: Size, annotations: Annotation[], color = ANNOTATION_COLOR): string {
  const marker = `<defs><marker id="segnavia-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="${color}"/></marker></defs>`
  return `<svg viewBox="0 0 ${size.width} ${size.height}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none">${marker}${annotations.map((a, i) => annotationGroup(a, i, color)).join('')}</svg>`
}
