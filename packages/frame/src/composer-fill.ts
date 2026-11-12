import type { PreflightEntry, PreflightRegion } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { fillLimits, regionRefusal, runFillStageOnce, truncatedRegion } from './composer-fill-policy.ts'
import { fillTemplateRegions, inkExcess } from './composer-page-dom.ts'

interface FillGeometry {
  parents: Array<{ textArea: { width: number; height: number } }>
}

function regionSubject(region: HTMLElement): string {
  const name = region.getAttribute('data-region') ?? region.getAttribute('data-segnavia-region') ?? ''
  const template = region.closest<HTMLElement>('[data-template]')?.getAttribute('data-template') ?? region.closest<HTMLElement>('[data-segnavia-template]')?.getAttribute('data-segnavia-template')
  const parent = region.getAttribute('data-segnavia-parent')
  return `${template ?? parent ?? 'region'}:${name}`
}

function repeatFill(region: HTMLElement): PreflightRegion[] {
  const source = region.querySelector<HTMLElement>(':scope > [data-fill="repeat"]')
  if (!source) return []
  const name = region.getAttribute('data-region') ?? region.getAttribute('data-segnavia-region') ?? ''
  const blockSize = region.getBoundingClientRect().height
  if (!Number.isFinite(blockSize) || blockSize <= 0) throw new Error(`Region ${name} has no definite block size; give the template or parent-page region a definite block size to clear this refusal.`)
  const limits = fillLimits(source.getAttribute('data-fill-min'), source.getAttribute('data-fill-max'))
  source.setAttribute('data-fill-index', '0')
  let count = 1
  while (count < limits.max) {
    const copy = source.cloneNode(true) as HTMLElement
    copy.setAttribute('data-fill-index', String(count))
    region.append(copy)
    const excess = inkExcess(region).block
    if (excess > 0.5 && count >= limits.min) {
      copy.remove()
      break
    }
    count += 1
  }
  const excess = inkExcess(region).block
  if (count < limits.min || excess > 0.5)
    throw new Error(`Region ${name} cannot fit its data-fill minimum of ${limits.min}; lower data-fill-min or enlarge the region to clear this refusal.`)
  region.setAttribute('data-segnavia-fill-count', String(count))
  return [{ subject: regionSubject(region), fillCount: count }]
}

function fillTemplateSourceRegions(
  root: ParentNode,
  geometry: (name: string | null | undefined) => FillGeometry,
  defaultDirection: string,
  defaultLang: string,
): PreflightRegion[] {
  const facts: PreflightRegion[] = []
  for (const template of Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-template]'))) {
    const templateName = template.getAttribute('data-segnavia-template') ?? ''
    const holders = Array.from(root.querySelectorAll<HTMLElement>('[data-segnavia-templated-page]')).filter(
      (holder) => holder.getAttribute('data-template') === templateName,
    )
    for (const holder of holders) {
      const flow = holder.closest<HTMLElement>('[data-segnavia-flow]')
      const area = geometry(flow?.getAttribute('data-page-geometry')).parents[0]?.textArea
      if (!area) throw new Error(`Template ${templateName} has no definite text area; configure a page parent to clear this refusal.`)
      const clone = template.cloneNode(true) as HTMLElement
      clone.removeAttribute('hidden')
      clone.removeAttribute('data-segnavia-template')
      clone.setAttribute('data-template', templateName)
      clone.style.cssText = `position:absolute;inset-block-start:0;inset-inline-start:-10000px;inline-size:${area.width}px;block-size:${area.height}px;overflow:visible;direction:${flow?.getAttribute('dir') ?? defaultDirection}`
      const lang = flow?.getAttribute('lang') ?? defaultLang
      if (lang) clone.setAttribute('lang', lang)
      fillTemplateRegions(clone, holder)
      ;(root as Document).body.append(clone)
      for (const region of Array.from(clone.querySelectorAll<HTMLElement>('[data-region]'))) {
        const added = repeatFill(region)
        facts.push(...added)
        if (added.length === 0) continue
        const name = region.getAttribute('data-region')
        const source = Array.from(holder.querySelectorAll<HTMLElement>('[data-region]')).find((candidate) => candidate.getAttribute('data-region') === name)
        if (source) source.replaceChildren(...Array.from(region.childNodes).map((child) => child.cloneNode(true)))
      }
      clone.remove()
    }
  }
  return facts
}

function fillSourceRegionsImplementation(
  root: ParentNode,
  geometry: (name: string | null | undefined) => FillGeometry,
  direction: string,
  lang: string,
): PreflightRegion[] {
  return fillTemplateSourceRegions(root, geometry, direction, lang)
}

function applyRegionOverflow(
  region: HTMLElement,
  folio: string,
  entries: PreflightEntry[],
  facts: PreflightRegion[],
  refusalEnabled: boolean,
): string | undefined {
  const mode = region.getAttribute('data-overflow') ?? 'grow'
  if (mode === 'grow') return undefined
  let excess = inkExcess(region).block
  if (excess <= 0.5) return undefined
  const subject = regionSubject(region)
  if (mode === 'refuse') return refusalEnabled ? regionRefusal(subject, folio, excess) : undefined
  const dropped: string[] = []
  while (excess > 0.5 && region.lastElementChild) {
    const child = region.lastElementChild as HTMLElement
    dropped.unshift(child.getAttribute('data-segnavia-id') ?? child.id ?? `${subject}:${dropped.length + 1}`)
    child.remove()
    excess = inkExcess(region).block
  }
  const result = truncatedRegion(subject, dropped, folio)
  entries.push(result.entry)
  facts.push(result.fact)
  return undefined
}

export function embeddedComposerFillFunctions(): string {
  return `${embedFunction('runFillStageOnce', runFillStageOnce)}
${embedFunction('fillLimits', fillLimits)}
${embedFunction('regionRefusal', regionRefusal)}
${embedFunction('truncatedRegion', truncatedRegion)}
${embedFunction('regionSubject', regionSubject)}
${embedFunction('repeatFill', repeatFill)}
${embedFunction('fillTemplateRegions', fillTemplateRegions)}
${embedFunction('inkExcess', inkExcess)}
${embedFunction('fillTemplateSourceRegions', fillTemplateSourceRegions)}
${embedFunction('fillSourceRegionsImplementation', fillSourceRegionsImplementation)}
${embedFunction('applyRegionOverflow', applyRegionOverflow)}
var fillStageState={done:false,results:[]};
globalThis.repeatFill=repeatFill;
var fillSourceRegions=function(){return runFillStageOnce(fillStageState,function(){preflightRegions=fillSourceRegionsImplementation(document,geometryFor,config.direction,config.lang);return preflightRegions;});};`
}
