import type { FitStrategy } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { fitSearch, reduceFitGroups } from '@segnavia/layout'

interface FitElementResult {
  element: HTMLElement
  id: string
  group?: string
  values: Record<FitStrategy, number>
  authored: Record<FitStrategy, number>
  units: Record<FitStrategy, string>
  stopped?: { strategy: FitStrategy; bound: number; excess: number }
}

function fitSourceElementsImplementation(root: ParentNode, absolutePx: Readonly<Record<string, number>>, search: typeof fitSearch, reduceGroups: typeof reduceFitGroups) {
  const elements = Array.from(root.querySelectorAll<HTMLElement>('[data-fit],[data-fit-min]'))
  const parseList = (value: string | null) => (value === null ? [] : value.split(',').map((part) => part.trim()))
  const parseValue = (text: string, strategy: FitStrategy) => {
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z]+)?$/i.exec(text)
    if (!match) return undefined
    const amount = Number(match[1])
    const unit = (match[2] ?? '').toLowerCase()
    if (strategy === 'leading' && unit === '') return { value: amount, unit }
    const factor = absolutePx[unit]
    return factor === undefined ? undefined : { value: amount * factor, unit: 'px' }
  }
  const apply = (element: HTMLElement, strategy: FitStrategy, value: number, unit: string) => {
    if (strategy === 'size') element.style.fontSize = `${value}px`
    else if (strategy === 'leading') element.style.lineHeight = unit === '' ? String(value) : `${value}px`
    else element.style.letterSpacing = `${value}px`
  }
  const results = elements.flatMap((element): FitElementResult[] => {
    const strategies = parseList(element.getAttribute('data-fit') ?? 'size') as FitStrategy[]
    const mins = parseList(element.getAttribute('data-fit-min'))
    const maxes = parseList(element.getAttribute('data-fit-max'))
    const steps = parseList(element.getAttribute('data-fit-step'))
    const computed = getComputedStyle(element)
    const fontSize = parseFloat(computed.fontSize)
    const authored: Record<FitStrategy, number> = { size: fontSize, leading: computed.lineHeight === 'normal' ? 1.2 : parseFloat(computed.lineHeight) / fontSize, tracking: computed.letterSpacing === 'normal' ? 0 : parseFloat(computed.letterSpacing) }
    const units: Record<FitStrategy, string> = { size: 'px', leading: '', tracking: 'px' }
    const bounds = strategies.flatMap((strategy, index) => {
      const min = parseValue(mins[index] ?? (strategy === 'tracking' ? '0px' : strategy === 'leading' ? '1' : '1px'), strategy)
      const max = maxes[index] ? parseValue(maxes[index] as string, strategy) : { value: authored[strategy], unit: units[strategy] }
      const step = steps[index] ? parseValue(steps[index] as string, strategy) : undefined
      if (!min || !max) return []
      units[strategy] = min.unit
      return [{ strategy, authored: authored[strategy], min: min.value, max: max.value, ...(step ? { step: step.value } : {}) }]
    })
    if (bounds.length !== strategies.length) return []
    const box = element.getAttribute('data-fit-box') === 'parent' ? element.parentElement : element
    if (!box) return []
    const axis = element.getAttribute('data-fit-axis') ?? 'block'
    const result = search(bounds, (values) => {
      for (const strategy of strategies) apply(element, strategy, values[strategy], units[strategy])
      const rect = box.getBoundingClientRect()
      const block = Math.max(0, box.scrollHeight - rect.height)
      const inline = Math.max(0, box.scrollWidth - rect.width)
      const excess = axis === 'block' ? block : axis === 'inline' ? inline : Math.max(block, inline)
      return { fits: excess <= 0.5, excess }
    })
    const slot = element.getAttribute('data-slot-overflow')
    const id = element.getAttribute('data-segnavia-id') ?? (slot ? decodeURIComponent(slot.split(':')[0] ?? '') : '')
    return [{ element, id, group: element.getAttribute('data-fit-group') ?? undefined, values: { ...result.values }, authored, units, stopped: result.stopped }]
  })
  const reduced = reduceGroups(results) as FitElementResult[]
  for (const result of reduced) {
    for (const [strategy, value] of Object.entries(result.values) as Array<[FitStrategy, number]>) apply(result.element, strategy, value, result.units[strategy])
    if (result.values.size !== undefined && result.values.size < result.authored.size - 0.01) result.element.setAttribute('data-segnavia-fit-state', 'shrunk')
  }
  return reduced.map((result) => ({ id: result.id, ...(result.group ? { group: result.group } : {}), values: Object.entries(result.values).map(([strategy, value]) => ({ strategy, value, unit: result.units[strategy as FitStrategy] })), ...(result.stopped ? { stopped: result.stopped } : {}) }))
}

export function embeddedComposerFitFunctions(): string {
  return `${embedFunction('fitSearch', fitSearch)}
${embedFunction('reduceFitGroups', reduceFitGroups)}
${embedFunction('fitSourceElementsImplementation', fitSourceElementsImplementation)}
var fitSourceElements=function(){fitMeasurements=fitSourceElementsImplementation(document,ABSOLUTE_PX,fitSearch,reduceFitGroups);for(var i=0;i<fitMeasurements.length;i++){var fit=fitMeasurements[i];if(fit.stopped){var stopped=fit.stopped;fitPreflightEntries.push({check:'fit-limit',subject:fit.id,message:'Fit '+fit.id+' exhausted '+stopped.strategy+' at '+stopped.bound+' with '+stopped.excess+'px excess; enlarge the fit box or lower the bound to clear it.'});}var values={};for(var v=0;v<fit.values.length;v++)values[fit.values[v].strategy]=fit.values[v].value+fit.values[v].unit;preflightFits.push({subject:fit.id,group:fit.group,values:values});}};
var fitSourceSlots=function(){fitSourceElements();};`
}
