import { PREFLIGHT_ISSUES_PER_CHECK, PREFLIGHT_MESSAGE_LIMIT, PREFLIGHT_SUBJECT_LIMIT } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'
import { logicalExtent } from './composer-axis-policy.ts'
import { type MeasuredLineBox, measureLineBoxes } from './composer-measure.ts'
import { embeddedComposerMeasureFunctions } from './composer-measure-embed.ts'
import { embeddedInkFunctions, inkExcess } from './composer-page-dom.ts'
import { graphemeInlineExtent } from './composer-properties.ts'
import { COMPOSE_FAILURE_ATTRIBUTE, COMPOSE_FAILURE_TEXT_LIMIT } from './composition-failure.ts'
import { LAYOUT_PHASE_TIMEOUT_MS, type LoadedLayoutScript } from './layout.ts'

export type LayoutPhase = 'galley' | 'composed'

export interface LayoutReportInput {
  readonly subject: string
  readonly message: string
}

export interface LayoutContext {
  readonly page: HTMLElement
  readonly elements: readonly Element[]
  ink(value: Range | Node | string): DOMRect
  lineBoxes(element: Element): readonly MeasuredLineBox[]
  report(data: LayoutReportInput): void
}

export interface InFrameLayoutProvider {
  galley?(context: LayoutContext): void | Promise<void>
  composed?(context: LayoutContext): void | Promise<void>
}

export interface SegnaviaLayoutRuntime {
  define(provider: InFrameLayoutProvider): void
  run(phase: LayoutPhase): Promise<void>
  reports(): readonly { check: 'layout-report'; subject: string; message: string }[]
  _loading?: string
  _loadFailed(error: unknown): void
}

declare global {
  interface Window {
    segnaviaLayout?: SegnaviaLayoutRuntime
  }
}

interface RuntimeProvider {
  name: string
  selects: string
  implementation?: InFrameLayoutProvider
  loadFailure?: string
}

export function boundedLayoutText(value: unknown, limit: number): string {
  return String(value ?? '').slice(0, limit)
}

function layoutRange(document: Document, value: Range | Node | string, elements: readonly Element[]): Range {
  const range = document.createRange()
  if (typeof value === 'string') {
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node && !(node.textContent ?? '').includes(value)) node = walker.nextNode()
      if (node) {
        const start = (node.textContent ?? '').indexOf(value)
        range.setStart(node, start)
        range.setEnd(node, start + value.length)
        return range
      }
    }
    throw new Error(`ink could not find ${JSON.stringify(value)} in the selected elements`)
  } else if ('setStart' in value && typeof value.setStart === 'function') return value as Range
  else range.selectNode(value as Node)
  return range
}

function layoutMeasurementNode(range: Range, value: Range | Node | string): Node | undefined {
  if (range.startContainer === range.endContainer && range.startOffset === 0 && range.endOffset === (range.startContainer.textContent ?? '').length)
    return range.startContainer
  return typeof value === 'object' && value !== null && !('setStart' in value) ? value : undefined
}

function layoutInkRect(
  document: Document,
  value: Range | Node | string,
  elements: readonly Element[],
  graphemeExtent: typeof graphemeInlineExtent,
  excess: typeof inkExcess,
): DOMRect {
  const range = layoutRange(document, value, elements)
  const box = range.getBoundingClientRect()
  const node = layoutMeasurementNode(range, value)
  const element = (node?.nodeType === 1 ? node : node?.parentElement) as HTMLElement | undefined
  const writingMode = element ? getComputedStyle(element).writingMode : 'horizontal-tb'
  const inline = node ? graphemeExtent(node, writingMode) : logicalExtent(box, writingMode, 'inline')
  const overflow = element ? excess(element) : { block: 0, inline: 0 }
  const vertical = writingMode.startsWith('vertical')
  const width = vertical ? box.width + overflow.block : Math.max(box.width, inline) + overflow.inline
  const height = vertical ? Math.max(box.height, inline) + overflow.inline : box.height + overflow.block
  return new DOMRect(box.left, box.top, width, height)
}

export function installLayoutRuntime(
  target: Window,
  document: Document,
  schedule: typeof setTimeout,
  cancel: typeof clearTimeout,
  timeoutMs: number,
  registrations: RuntimeProvider[],
  reportLimits: { issues: number; subject: number; message: number },
  measureLines: typeof measureLineBoxes = measureLineBoxes,
  graphemeExtent: typeof graphemeInlineExtent = graphemeInlineExtent,
  excess: typeof inkExcess = inkExcess,
): SegnaviaLayoutRuntime {
  const reports: Array<{ check: 'layout-report'; subject: string; message: string }> = []
  const completed = new Set<LayoutPhase>()

  const lineBoxes = (element: Element): MeasuredLineBox[] => measureLines(element, element.getBoundingClientRect().top)

  const runtime: SegnaviaLayoutRuntime = {
    define(implementation) {
      const name = runtime._loading
      const registration = registrations.find((candidate) => candidate.name === name)
      if (!registration) throw new Error('segnaviaLayout.define must run from a registered layout provider script.')
      registration.implementation = implementation
    },
    _loadFailed(error) {
      const registration = registrations.find((candidate) => candidate.name === runtime._loading)
      if (!registration) throw new Error('A layout provider load failure was reported outside its registered script.')
      registration.loadFailure = error instanceof Error ? error.message : String(error)
    },
    async run(phase) {
      if (completed.has(phase)) return
      for (const registration of registrations) {
        if (registration.loadFailure) throw new Error(`Layout provider ${registration.name} failed to load: ${registration.loadFailure}`)
        const implementation = registration.implementation
        if (!implementation)
          throw new Error(`Layout provider ${registration.name} did not call segnaviaLayout.define; add its definition to clear this refusal.`)
        const run = implementation[phase]
        if (!run) continue
        const elements = Array.from(document.querySelectorAll(registration.selects))
        const context: LayoutContext = {
          page: document.documentElement,
          elements,
          ink: (value) => layoutInkRect(document, value, elements, graphemeExtent, excess),
          lineBoxes,
          report(data) {
            if (reports.length >= reportLimits.issues) return
            reports.push({
              check: 'layout-report',
              subject: boundedLayoutText(`${registration.name}:${data?.subject ?? ''}`, reportLimits.subject),
              message: boundedLayoutText(data?.message, reportLimits.message),
            })
          },
        }
        await new Promise<void>((resolve, reject) => {
          const timer = schedule(
            () =>
              reject(
                new Error(
                  `Layout provider ${registration.name} did not settle its ${phase} phase within ${timeoutMs}ms; make the phase settle to clear this refusal.`,
                ),
              ),
            timeoutMs,
          )
          Promise.resolve()
            .then(() => run(context))
            .then(
              () => {
                cancel(timer)
                resolve()
              },
              (error) => {
                cancel(timer)
                const reason = error instanceof Error ? error.message : String(error)
                reject(new Error(`Layout provider ${registration.name} refused its ${phase} phase: ${reason}`))
              },
            )
        })
      }
      completed.add(phase)
    },
    reports: () => reports,
  }
  target.segnaviaLayout = runtime
  return runtime
}

export function layoutRuntimeScript(scripts: readonly LoadedLayoutScript[]): string {
  if (scripts.length === 0) return ''
  const registrations = scripts.map(({ name, selects }) => ({ name, selects }))
  const definitions = scripts
    .map(
      ({ name, script }) =>
        `window.segnaviaLayout._loading=${JSON.stringify(name)};\ntry{${script}\n}catch(error){window.segnaviaLayout._loadFailed(error);}finally{window.segnaviaLayout._loading=undefined;}`,
    )
    .join('\n')
  const serializedRegistrations = JSON.stringify(registrations).replace(/</g, '\\u003c')
  return `${embeddedComposerMeasureFunctions()}\n${embeddedInkFunctions()}\n${embedFunction('graphemeInlineExtent', graphemeInlineExtent)}\n${embedFunction('layoutRange', layoutRange)}\n${embedFunction('layoutMeasurementNode', layoutMeasurementNode)}\n${embedFunction('layoutInkRect', layoutInkRect)}\n${embedFunction('boundedLayoutText', boundedLayoutText)}\n${embedFunction('installLayoutRuntime', installLayoutRuntime)}\ninstallLayoutRuntime(window,document,setTimeout,clearTimeout,${LAYOUT_PHASE_TIMEOUT_MS},${serializedRegistrations},{issues:${PREFLIGHT_ISSUES_PER_CHECK},subject:${PREFLIGHT_SUBJECT_LIMIT},message:${PREFLIGHT_MESSAGE_LIMIT}},measureLineBoxes,graphemeInlineExtent,inkExcess);\n${definitions}`
}

export function withLayoutScripts(html: string, nonce: string, scripts: readonly LoadedLayoutScript[]): string {
  if (scripts.length === 0) return html
  const tag = `<script nonce="${nonce}">${layoutRuntimeScript(scripts)}</script>`
  if (/<head(?:\s[^>]*)?>/i.test(html)) return html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${tag}`)
  if (/<body(?:\s[^>]*)?>/i.test(html)) return html.replace(/<body(?:\s[^>]*)?>/i, (body) => `${body}${tag}`)
  return `${tag}${html}`
}

export function layoutReadyBridgeScript(options: { readonly layoutScripts?: readonly LoadedLayoutScript[]; readonly readyAfterAttribute?: string }): {
  declaration: string
  join: string
} {
  if ((options.layoutScripts?.length ?? 0) === 0) return { declaration: '', join: '' }
  const expression = options.readyAfterAttribute
    ? 'null'
    : `window.segnaviaLayout.run('galley').then(function(){return window.segnaviaLayout.run('composed');}).catch(function(error){var text=String(error&&error.message||error).slice(0,${COMPOSE_FAILURE_TEXT_LIMIT});document.documentElement.setAttribute('${COMPOSE_FAILURE_ATTRIBUTE}',text);post({type:'segnavia:compose-failure',text:text});return new Promise(function(){});})`
  return { declaration: `var layouts=${expression};`, join: ',layouts' }
}
