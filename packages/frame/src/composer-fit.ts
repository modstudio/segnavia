import type { FitStrategy } from '@segnavia/format'
import { embedFunction, fitList, parseCssLength } from '@segnavia/html'
import { fitSearch, reduceFitGroups } from '@segnavia/layout'
import { FIT_AXES, fitApplication, fitAxis, fitBounds, fitLimitEntry, fitMeasurements, fitValue, runFitStageOnce } from './composer-fit-policy.ts'
import { fillTemplateRegions, inkExcess } from './composer-page-dom.ts'

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
interface FitGeometry {
  paperWidth: number
  paperHeight: number
  parents: Array<{ textArea: { width: number; height: number } }>
}

const FIT_SELECTOR = '[data-fit],[data-fit-min]'

function applyFitStyles(element: HTMLElement, styles: ReturnType<typeof fitApplication>['styles']) {
  for (const [property, value] of Object.entries(styles) as Array<[keyof typeof styles, string]>) element.style[property] = value
}

function templatePageFits(
  documentRoot: Document,
  template: HTMLElement,
  holder: HTMLElement,
  name: string,
  area: { width: number; height: number },
  direction: string,
  lang: string,
): TemporaryFit[] {
  const clone = template.cloneNode(true) as HTMLElement
  clone.removeAttribute('hidden')
  clone.removeAttribute('data-segnavia-template')
  clone.style.cssText = `position:absolute;inset-block-start:0;inset-inline-start:-10000px;inline-size:${area.width}px;block-size:${area.height}px;overflow:visible;direction:${direction}`
  if (lang) clone.setAttribute('lang', lang)
  fillTemplateRegions(clone, holder)
  documentRoot.body.append(clone)
  const entries = Array.from(clone.querySelectorAll<HTMLElement>(FIT_SELECTOR)).map((fitted) => {
    const region = fitted.closest<HTMLElement>('[data-region]')
    const regionName = region?.getAttribute('data-region') ?? ''
    const position = region ? Array.from(region.querySelectorAll<HTMLElement>(FIT_SELECTOR)).indexOf(fitted) : 0
    const heldRegion = Array.from(holder.querySelectorAll<HTMLElement>('[data-region]')).find((candidate) => candidate.getAttribute('data-region') === regionName)
    const templateRegion = Array.from(template.querySelectorAll<HTMLElement>('[data-region]')).find(
      (candidate) => candidate.getAttribute('data-region') === regionName,
    )
    const source = Array.from((heldRegion ?? templateRegion ?? template).querySelectorAll<HTMLElement>(FIT_SELECTOR))[position]
    if (!source) throw new Error(`template "${name}" region "${regionName}" fit ${position + 1} has no source; keep the fitted block in its region to clear this refusal`)
    const subject = fitted.getAttribute('data-segnavia-id') ?? fitted.closest<HTMLElement>('[data-segnavia-id]')?.getAttribute('data-segnavia-id')
    if (!subject) throw new Error(`template "${name}" region "${regionName}" fit ${position + 1} has no block id; place it in an identified block to clear this refusal`)
    fitted.setAttribute('data-segnavia-id', subject)
    if (!fitted.hasAttribute('data-fit-group')) fitted.setAttribute('data-fit-group', `segnavia-template-${name}-${regionName}-${position}`)
    return { clone, fitted, source }
  })
  if (entries.length === 0) clone.remove()
  return entries
}

function templateFits(
  root: ParentNode,
  geometry: (name: string | null | undefined) => FitGeometry,
  defaultDirection: string,
  defaultLang: string,
): TemporaryFit[] {
  const temporary: TemporaryFit[] = []
  for (const template of Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-template]'))) {
    const name = template.getAttribute('data-segnavia-template') ?? ''
    const holders = Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-templated-page]')).filter(
      (held) => held.getAttribute('data-template') === name,
    )
    for (const holder of holders) {
      const flow = holder.closest<HTMLElement>('[data-segnavia-flow]')
      const area = geometry(flow?.getAttribute('data-page-geometry')).parents[0].textArea
      temporary.push(...templatePageFits(root as Document, template, holder, name, area, flow?.getAttribute('dir') ?? defaultDirection, flow?.getAttribute('lang') ?? defaultLang))
    }
  }
  return temporary
}

function designedFits(
  root: ParentNode,
  geometry: (name: string | null | undefined) => FitGeometry,
  defaultDirection: string,
  defaultLang: string,
): TemporaryFit[] {
  const temporary: TemporaryFit[] = []
  for (const holder of Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-designed-page]'))) {
    const sourceFits = Array.from(holder.querySelectorAll<HTMLElement>(FIT_SELECTOR))
    if (sourceFits.length === 0) continue
    const flow = holder.closest<HTMLElement>('[data-segnavia-flow]')
    const area = geometry(flow?.getAttribute('data-page-geometry'))
    const clone = holder.cloneNode(true) as HTMLElement
    clone.removeAttribute('hidden')
    clone.style.cssText = `position:absolute;inset-block-start:0;inset-inline-start:-10000px;inline-size:${area.paperWidth}px;block-size:${area.paperHeight}px;overflow:hidden;direction:${flow?.getAttribute('dir') ?? defaultDirection}`
    const lang = flow?.getAttribute('lang') ?? defaultLang
    if (lang) clone.setAttribute('lang', lang)
    ;(root as Document).body.append(clone)
    const fitted = Array.from(clone.querySelectorAll<HTMLElement>(FIT_SELECTOR))
    for (let index = 0; index < fitted.length; index += 1) temporary.push({ clone, fitted: fitted[index] as HTMLElement, source: sourceFits[index] as HTMLElement })
  }
  return temporary
}

function fitElement(element: HTMLElement, absolutePx: Readonly<Record<string, number>>): FitResult | undefined {
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
  const candidate = fitBounds(strategies, mins, maxes, steps, authored, absolutePx)
  const box = element.getAttribute('data-fit-box') === 'parent' ? element.parentElement : element
  if (!candidate || !box) return undefined
  const { bounds, units } = candidate
  const slot = element.getAttribute('data-slot-overflow')
  const axis = fitAxis(element.getAttribute('data-fit-axis'), slot !== null)
  const result = fitSearch(bounds, (values) => {
    applyFitStyles(element, fitApplication({ id: '', values: { ...authored, ...values }, authored, units }).styles)
    const { block, inline } = inkExcess(element, box)
    const excess = axis === 'block' ? block : axis === 'inline' ? inline : Math.max(block, inline)
    return { fits: excess <= 0.5, excess }
  })
  let slotSubject = ''
  if (slot) {
    try {
      slotSubject = decodeURIComponent(slot.split(':')[0] ?? '')
    } catch {}
  }
  const id = element.getAttribute('data-segnavia-id') ?? element.closest<HTMLElement>('[data-segnavia-id]')?.getAttribute('data-segnavia-id') ?? slotSubject
  if (!id) throw new Error('data-fit has no identified block subject; place it in a block element to clear this refusal')
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
    const application = fitApplication(result)
    applyFitStyles(result.element, application.styles)
    result.element.setAttribute('data-segnavia-fit-state', application.shrunk ? 'shrunk' : 'fit')
  }
}

function finishTemporaryFits(temporary: TemporaryFit[]) {
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
  geometry: (name: string | null | undefined) => FitGeometry,
  defaultDirection: string,
  defaultLang: string,
) {
  const temporary = [...templateFits(root, geometry, defaultDirection, defaultLang), ...designedFits(root, geometry, defaultDirection, defaultLang)]
  const ordinary = Array.from(root.querySelectorAll<HTMLElement>(FIT_SELECTOR)).filter(
    (element) => !element.closest('[data-segnavia-template],[data-segnavia-templated-page],[data-segnavia-designed-page]') && element.getClientRects().length > 0,
  )
  const candidates = [...ordinary, ...temporary.map((entry) => entry.fitted)]
  const results = candidates.flatMap((element) => {
    const result = fitElement(element, absolutePx)
    return result ? [result] : []
  })
  const reduced = reduceFitGroups(results) as FitResult[]
  applyFits(reduced)
  finishTemporaryFits(temporary)
  return fitMeasurements(reduced)
}

export function embeddedComposerFitFunctions(): string {
  return `${embedFunction('fitSearch', fitSearch)}
${embedFunction('reduceFitGroups', reduceFitGroups)}
var FIT_AXES=${JSON.stringify(FIT_AXES)};
var FIT_SELECTOR=${JSON.stringify(FIT_SELECTOR)};
${embedFunction('parseCssLength', parseCssLength)}
${embedFunction('fitValue', fitValue)}
${embedFunction('fitAxis', fitAxis)}
${embedFunction('fitBounds', fitBounds)}
${embedFunction('fitApplication', fitApplication)}
${embedFunction('runFitStageOnce', runFitStageOnce)}
${embedFunction('fitMeasurements', fitMeasurements)}
${embedFunction('fitLimitEntry', fitLimitEntry)}
${embedFunction('fitList', fitList)}
${embedFunction('applyFitStyles', applyFitStyles)}
${embedFunction('fillTemplateRegions', fillTemplateRegions)}
${embedFunction('inkExcess', inkExcess)}
${embedFunction('templatePageFits', templatePageFits)}
${embedFunction('templateFits', templateFits)}
${embedFunction('designedFits', designedFits)}
${embedFunction('fitElement', fitElement)}
${embedFunction('applyFits', applyFits)}
${embedFunction('finishTemporaryFits', finishTemporaryFits)}
${embedFunction('fitSourceElementsImplementation', fitSourceElementsImplementation)}
var fitStageState={done:false,results:[]};
var fitSourceElements=function(){return runFitStageOnce(fitStageState,function(){fitPreflightEntries=[];preflightFits=[];var results=fitSourceElementsImplementation(document,ABSOLUTE_PX,geometryFor,config.direction,config.lang);for(var i=0;i<results.length;i++){var fit=results[i];var entry=fitLimitEntry(fit);if(entry)fitPreflightEntries.push(entry);var values={};for(var v=0;v<fit.values.length;v++)values[fit.values[v].strategy]=fit.values[v].value+fit.values[v].unit;preflightFits.push({subject:fit.id,group:fit.group,values:values});}return results;});};
var fitSourceSlots=function(){fitSourceElements();};`
}
