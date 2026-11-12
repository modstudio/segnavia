import type { FitStrategy } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { fitSearch, reduceFitGroups } from '@segnavia/layout'

interface FitResult {
  element: HTMLElement
  id: string
  group?: string
  values: Record<FitStrategy, number>
  authored: Record<FitStrategy, number>
  units: Record<FitStrategy, string>
  stopped?: { strategy: FitStrategy; bound: number; excess: number }
}
interface TemporaryFit {
  clone: HTMLElement
  fitted: HTMLElement
  source: HTMLElement
}

const fitList = (value: string | null) => (value === null ? [] : value.split(',').map((part) => part.trim()))

function fitValue(text: string, strategy: FitStrategy, absolutePx: Readonly<Record<string, number>>) {
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z]+)?$/i.exec(text)
  if (!match) return undefined
  const amount = Number(match[1])
  const unit = (match[2] ?? '').toLowerCase()
  if (strategy === 'leading' && unit === '') return { value: amount, unit }
  const factor = absolutePx[unit]
  return factor === undefined ? undefined : { value: amount * factor, unit: 'px' }
}

function applyFitValue(element: HTMLElement, strategy: FitStrategy, value: number, unit: string) {
  if (strategy === 'size') element.style.fontSize = `${value}px`
  else if (strategy === 'leading') element.style.lineHeight = unit === '' ? String(value) : `${value}px`
  else element.style.letterSpacing = `${value}px`
}

function fitExcess(element: HTMLElement, box: HTMLElement) {
  const bounds = box.getBoundingClientRect()
  let top = bounds.top
  let right = bounds.right
  let bottom = bounds.bottom
  let left = bounds.left
  const include = (rect: DOMRect) => {
    if (rect.width === 0 && rect.height === 0) return
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
    left = Math.min(left, rect.left)
  }
  const range = document.createRange()
  range.selectNodeContents(element)
  if (!range.collapsed) include(range.getBoundingClientRect())
  for (const child of Array.from(element.querySelectorAll<HTMLElement>('*'))) include(child.getBoundingClientRect())
  const vertical = getComputedStyle(box).writingMode.startsWith('vertical')
  const height = Math.max(bottom - bounds.bottom, bounds.top - top, element === box ? box.scrollHeight - bounds.height : 0)
  const width = Math.max(right - bounds.right, bounds.left - left, element === box ? box.scrollWidth - bounds.width : 0)
  return vertical ? { block: width, inline: height } : { block: height, inline: width }
}

function templatePageFits(
  documentRoot: Document,
  template: HTMLElement,
  holder: HTMLElement,
  name: string,
  area: { width: number; height: number },
): TemporaryFit[] {
  const clone = template.cloneNode(true) as HTMLElement
  clone.removeAttribute('hidden')
  clone.removeAttribute('data-segnavia-template')
  clone.style.cssText = `position:absolute;inset-block-start:0;inset-inline-start:-10000px;inline-size:${area.width}px;block-size:${area.height}px;overflow:visible`
  for (const fragment of Array.from(holder.querySelectorAll<HTMLElement>('[data-region]'))) {
    const region = fragment.getAttribute('data-region')
    const target = region
      ? Array.from(clone.querySelectorAll<HTMLElement>('[data-region]')).find((held) => held.getAttribute('data-region') === region)
      : undefined
    if (target) target.innerHTML = fragment.innerHTML
  }
  documentRoot.body.append(clone)
  const entries = Array.from(clone.querySelectorAll<HTMLElement>('[data-fit],[data-fit-min]')).flatMap((fitted) => {
    const region = fitted.getAttribute('data-region') ?? ''
    const source = Array.from(template.querySelectorAll<HTMLElement>('[data-fit],[data-fit-min]')).find(
      (candidate) => candidate.getAttribute('data-region') === region,
    )
    if (!source) return []
    const block = fitted.querySelector<HTMLElement>('[data-segnavia-id]')
    fitted.setAttribute('data-segnavia-id', block?.getAttribute('data-segnavia-id') ?? `${name}:${region}`)
    if (!fitted.hasAttribute('data-fit-group')) fitted.setAttribute('data-fit-group', `segnavia-template-${name}-${region}`)
    return [{ clone, fitted, source }]
  })
  if (entries.length === 0) clone.remove()
  return entries
}

function templateFits(root: ParentNode, area: { width: number; height: number }): TemporaryFit[] {
  const temporary: TemporaryFit[] = []
  for (const template of Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-template]'))) {
    const name = template.getAttribute('data-segnavia-template') ?? ''
    const holders = Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-templated-page]')).filter(
      (held) => held.getAttribute('data-template') === name,
    )
    for (const holder of holders) temporary.push(...templatePageFits(root as Document, template, holder, name, area))
  }
  return temporary
}

function fitElement(element: HTMLElement, absolutePx: Readonly<Record<string, number>>, search: typeof fitSearch): FitResult | undefined {
  const strategies = fitList(element.getAttribute('data-fit') ?? 'size') as FitStrategy[]
  const mins = fitList(element.getAttribute('data-fit-min'))
  const maxes = fitList(element.getAttribute('data-fit-max'))
  const steps = fitList(element.getAttribute('data-fit-step'))
  const computed = getComputedStyle(element)
  const fontSize = parseFloat(computed.fontSize)
  const authored: Record<FitStrategy, number> = {
    size: fontSize,
    leading: computed.lineHeight === 'normal' ? 1.2 : parseFloat(computed.lineHeight) / fontSize,
    tracking: computed.letterSpacing === 'normal' ? 0 : parseFloat(computed.letterSpacing),
  }
  const units: Record<FitStrategy, string> = { size: 'px', leading: '', tracking: 'px' }
  const bounds = strategies.flatMap((strategy, index) => {
    const fallback = strategy === 'tracking' ? '0px' : strategy === 'leading' ? '1' : '1px'
    const min = fitValue(mins[index] ?? fallback, strategy, absolutePx)
    const max = maxes[index] ? fitValue(maxes[index] as string, strategy, absolutePx) : { value: authored[strategy], unit: units[strategy] }
    const step = steps[index] ? fitValue(steps[index] as string, strategy, absolutePx) : undefined
    if (!min || !max) return []
    units[strategy] = min.unit
    return [{ strategy, authored: authored[strategy], min: min.value, max: max.value, ...(step ? { step: step.value } : {}) }]
  })
  const box = element.getAttribute('data-fit-box') === 'parent' ? element.parentElement : element
  if (bounds.length !== strategies.length || !box) return undefined
  const axis = element.getAttribute('data-fit-axis') ?? 'block'
  const result = search(bounds, (values) => {
    for (const strategy of strategies) applyFitValue(element, strategy, values[strategy] ?? authored[strategy], units[strategy])
    const { block, inline } = fitExcess(element, box)
    const excess = axis === 'block' ? block : axis === 'inline' ? inline : Math.max(block, inline)
    return { fits: excess <= 0.5, excess }
  })
  const slot = element.getAttribute('data-slot-overflow')
  const id = element.getAttribute('data-segnavia-id') ?? (slot ? decodeURIComponent(slot.split(':')[0] ?? '') : '')
  return {
    element,
    id,
    group: element.getAttribute('data-fit-group') ?? undefined,
    values: { ...result.values } as Record<FitStrategy, number>,
    authored,
    units,
    stopped: result.stopped,
  }
}

function applyFits(results: FitResult[]) {
  for (const result of results) {
    for (const [strategy, value] of Object.entries(result.values) as Array<[FitStrategy, number]>)
      applyFitValue(result.element, strategy, value, result.units[strategy])
    if (result.values.size !== undefined && result.values.size < result.authored.size - 0.01) result.element.setAttribute('data-segnavia-fit-state', 'shrunk')
  }
}

function finishTemplateFits(temporary: TemporaryFit[]) {
  for (const entry of temporary) {
    entry.source.style.fontSize = entry.fitted.style.fontSize
    entry.source.style.lineHeight = entry.fitted.style.lineHeight
    entry.source.style.letterSpacing = entry.fitted.style.letterSpacing
    if (entry.fitted.hasAttribute('data-segnavia-fit-state')) entry.source.setAttribute('data-segnavia-fit-state', 'shrunk')
  }
  for (const entry of temporary) entry.clone.remove()
}

function fitSourceElementsImplementation(
  root: ParentNode,
  absolutePx: Readonly<Record<string, number>>,
  area: { width: number; height: number },
  search: typeof fitSearch,
  reduceGroups: typeof reduceFitGroups,
) {
  const temporary = templateFits(root, area)
  const visible = Array.from(root.querySelectorAll<HTMLElement>('[data-fit],[data-fit-min]')).filter((element) => element.getClientRects().length > 0)
  const results = visible.flatMap((element) => {
    const result = fitElement(element, absolutePx, search)
    return result ? [result] : []
  })
  const reduced = reduceGroups(results) as FitResult[]
  applyFits(reduced)
  finishTemplateFits(temporary)
  const unique = reduced.filter((result, index, all) => all.findIndex((candidate) => candidate.id === result.id) === index)
  return unique.map((result) => ({
    id: result.id,
    ...(result.group ? { group: result.group } : {}),
    values: Object.entries(result.values).map(([strategy, value]) => ({ strategy, value, unit: result.units[strategy as FitStrategy] })),
    ...(result.stopped ? { stopped: result.stopped } : {}),
  }))
}

export function embeddedComposerFitFunctions(): string {
  return `${embedFunction('fitSearch', fitSearch)}
${embedFunction('reduceFitGroups', reduceFitGroups)}
${embedFunction('fitList', fitList)}
${embedFunction('fitValue', fitValue)}
${embedFunction('applyFitValue', applyFitValue)}
${embedFunction('fitExcess', fitExcess)}
${embedFunction('templatePageFits', templatePageFits)}
${embedFunction('templateFits', templateFits)}
${embedFunction('fitElement', fitElement)}
${embedFunction('applyFits', applyFits)}
${embedFunction('finishTemplateFits', finishTemplateFits)}
${embedFunction('fitSourceElementsImplementation', fitSourceElementsImplementation)}
var fitSourceElements=function(){fitMeasurements=fitSourceElementsImplementation(document,ABSOLUTE_PX,defaultGeometry.parents[0].textArea,fitSearch,reduceFitGroups);for(var i=0;i<fitMeasurements.length;i++){var fit=fitMeasurements[i];if(fit.stopped){var stopped=fit.stopped;fitPreflightEntries.push({check:'fit-limit',subject:fit.id,message:'Fit '+fit.id+' exhausted '+stopped.strategy+' at '+stopped.bound+' with '+stopped.excess+'px excess; enlarge the fit box or lower the bound to clear it.'});}var values={};for(var v=0;v<fit.values.length;v++)values[fit.values[v].strategy]=fit.values[v].value+fit.values[v].unit;preflightFits.push({subject:fit.id,group:fit.group,values:values});}};
var fitSourceSlots=function(){fitSourceElements();};`
}
