import type { HtmlElementAttributes } from '@segnavia/html'

export interface LayoutSelection {
  readonly tag?: string
  readonly attributes: readonly { name: string; operator: 'present' | 'exact' | 'token'; value?: string }[]
}

export function parseSelection(selects: string): LayoutSelection | undefined {
  const match = /^([a-z][a-z0-9-]*)?((?:\[[a-z][a-z0-9-]*(?:(?:=|~=)"[^"]*")?\])+)$/i.exec(selects)
  if (!match) return undefined
  const attributes = Array.from(match[2]?.matchAll(/\[([a-z][a-z0-9-]*)(?:(=|~=)"([^"]*)")?\]/gi) ?? [], (held) => ({
    name: held[1]?.toLowerCase() ?? '',
    operator: held[2] === '=' ? ('exact' as const) : held[2] === '~=' ? ('token' as const) : ('present' as const),
    ...(held[3] === undefined ? {} : { value: held[3] }),
  }))
  return attributes.length > 0 ? { ...(match[1] ? { tag: match[1].toLowerCase() } : {}), attributes } : undefined
}

export function selectionMatches(selection: LayoutSelection, element: HtmlElementAttributes): boolean {
  if (selection.tag && selection.tag !== element.name) return false
  return selection.attributes.every(({ name, operator, value }) => {
    const held = element.attributes[name]
    if (held === undefined) return false
    if (operator === 'present') return true
    if (operator === 'exact') return held === value
    return held.split(/\s+/).includes(value ?? '')
  })
}
