import { fieldLength, fieldLines, htmlElementAttributes } from '@segnavia/html'

export const FIELD_BASE_CSS = `:where([data-segnavia-field]){box-sizing:border-box;color:var(--segnavia-field-answer-color,currentColor);font:var(--segnavia-field-answer-font,inherit)}
:where([data-segnavia-field="checkbox"]){display:inline-block;position:relative;box-sizing:border-box;inline-size:1em;block-size:1em;border:var(--segnavia-field-rule-width,1px) solid var(--segnavia-field-box-color,currentColor);vertical-align:-.1em}
:where([data-segnavia-field="checkbox"]::after){content:"" / "checked";position:absolute;inset-block-start:12%;inset-inline-start:25%;inline-size:35%;block-size:60%;border-block-end:var(--segnavia-field-rule-width,2px) solid var(--segnavia-field-mark-color,currentColor);border-inline-end:var(--segnavia-field-rule-width,2px) solid var(--segnavia-field-mark-color,currentColor);rotate:45deg;opacity:0}
:where([data-segnavia-field="checkbox"][data-segnavia-field-checked]::after){opacity:1}
:where([data-segnavia-field="line"]){display:inline-block;min-inline-size:2em;padding-inline-end:2em;border-block-end:var(--segnavia-field-rule-width,1px) solid var(--segnavia-field-rule-color,currentColor)}
:where(:is(p,li,dt,dd,h1,h2,h3,h4,h5,h6,blockquote,figcaption,caption,td,th,summary,label,pre,div,section,article,aside,address):has([data-segnavia-field="line"]:not([data-segnavia-field-length]))){position:relative;overflow-x:clip}
:where([data-segnavia-field="line"]:not([data-segnavia-field-length])){display:inline;position:static;border-block-end:0}
:where([data-segnavia-field="line"]:not([data-segnavia-field-length])::after){content:"";position:absolute;inline-size:100vi;border-block-end:var(--segnavia-field-rule-width,1px) solid var(--segnavia-field-rule-color,currentColor)}
:where([data-segnavia-field="box"]){display:block;box-sizing:border-box;min-block-size:1lh;border:var(--segnavia-field-rule-width,1px) solid var(--segnavia-field-box-color,currentColor);padding-inline:.25em;overflow:hidden}
:where([data-segnavia-field="box"][data-segnavia-field-rule="ruled"]){background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(1lh - var(--segnavia-field-rule-width,1px)),var(--segnavia-field-rule-color,currentColor) calc(1lh - var(--segnavia-field-rule-width,1px)),var(--segnavia-field-rule-color,currentColor) 1lh)}`

export function fieldSizeCss(html: string): string {
  const lengths = new Set<string>()
  const lines = new Set<number>()
  for (const element of htmlElementAttributes(html)) {
    if (element.name === 'span' && element.attributes['data-segnavia-field'] === 'line') {
      const value = element.attributes['data-segnavia-field-length']
      const parsed = value === undefined ? undefined : fieldLength(value)
      if (parsed !== undefined) lengths.add(parsed)
    }
    if (element.name === 'div' && element.attributes['data-segnavia-field'] === 'box') {
      const value = element.attributes['data-segnavia-field-lines']
      const parsed = value === undefined ? undefined : fieldLines(value)
      if (parsed !== undefined) lines.add(parsed)
    }
  }
  return [
    ...[...lengths].sort().map(
      (value) => `:where([data-segnavia-field="line"][data-segnavia-field-length="${value}"]){inline-size:${value}}`,
    ),
    ...[...lines].sort((a, b) => a - b).map(
      (value) => `:where([data-segnavia-field="box"][data-segnavia-field-lines="${value}"]){block-size:calc(${value} * 1lh)}`,
    ),
  ].join('')
}
