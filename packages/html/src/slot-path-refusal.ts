import { RECORD_CONTEXT } from '@segnavia/format'
import { bindingNames } from './bindings.ts'
import { elements, parse } from './sanitize.ts'

/** Refuses value bindings absent from the declarations available when the HTML is shown. */
export function refuseUndefinedSlotPaths(html: string, declaredKeys: Iterable<string>): string {
  const valueName = bindingNames('slot').value
  if (!html.toLowerCase().includes(valueName)) return html
  const defined = new Set(declaredKeys)
  const document = parse(html)
  for (const element of elements(document.children)) {
    const path = element.attribs[valueName]
    if (path !== undefined && !defined.has(path) && !path.startsWith(`${RECORD_CONTEXT}.`)) {
      throw new RangeError(
        `data-slot-value names undefined slot path ${JSON.stringify(path)}; declare that slot or remove data-slot-value to clear this refusal`,
      )
    }
  }
  return html
}
