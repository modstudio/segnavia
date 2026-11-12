import type { SlotDeclaration, SlotReport } from '@segnavia/format'
import type { Element } from 'domhandler'
import type { bindingNames } from './bindings.ts'

interface SlotOverflowContext {
  declarations: ReadonlyMap<string, SlotDeclaration>
  markedHere: Set<string>
  report: SlotReport
}

const FIT_ATTRIBUTES = ['data-fit', 'data-fit-min', 'data-fit-max', 'data-fit-step', 'data-fit-axis', 'data-fit-box', 'data-fit-group'] as const

export function clearSlotOverflow(element: Element): void {
  delete element.attribs['data-slot-overflow']
}

export function markSlotOverflow(element: Element, names: ReturnType<typeof bindingNames>, context: SlotOverflowContext): void {
  if (context.report.fill === null) return
  for (const binding of Object.values(names)) {
    const key = element.attribs[binding]
    if (key === undefined) continue
    const declaration = context.declarations.get(key)
    const overflow = declaration?.overflow ?? 'wrap'
    if (!declaration || overflow === 'wrap' || context.report.slots[key] !== 'filled') continue
    if (overflow === 'shrink' && FIT_ATTRIBUTES.some((attribute) => element.attribs[attribute] !== undefined)) {
      throw new RangeError(`slot "${key}" has both overflow shrink and authored data-fit; remove data-fit or use another overflow mode to clear this refusal`)
    }
    const minSize = declaration.minSize
    element.attribs['data-slot-overflow'] = `${encodeURIComponent(key)}:${overflow}${overflow === 'shrink' ? `:${minSize}` : ''}`
    if (overflow === 'shrink') {
      element.attribs['data-fit'] = 'size'
      element.attribs['data-fit-min'] = `${minSize}px`
    }
    context.markedHere.add(key)
    return
  }
}
