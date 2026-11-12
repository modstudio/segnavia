import { embedFunction } from '@segnavia/html'
import { logicalExtent } from './composer-axis-policy.ts'
import { measureLineBoxes, type MeasuredLineBox } from './composer-measure.ts'
import { embeddedComposerMeasureFunctions } from './composer-measure-embed.ts'
import { inkExcess } from './composer-page-dom.ts'
import { graphemeInlineExtent } from './composer-properties.ts'
import type { LoadedLayoutScript } from './layout.ts'

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
}

export function boundedLayoutText(value: unknown, limit: number): string {
  return String(value ?? '').slice(0, limit)
}

export function installLayoutRuntime(
  target: Window,
  document: Document,
  schedule: typeof setTimeout,
  cancel: typeof clearTimeout,
  timeoutMs: number,
  registrations: RuntimeProvider[],
  measureLines: typeof measureLineBoxes = measureLineBoxes,
  graphemeExtent: typeof graphemeInlineExtent = graphemeInlineExtent,
  excess: typeof inkExcess = inkExcess,
): SegnaviaLayoutRuntime {
  const reports: Array<{ check: 'layout-report'; subject: string; message: string }> = []
  const completed = new Set<LayoutPhase>()

  const rectFor = (value: Range | Node | string, elements: readonly Element[]): DOMRect => {
    let range: Range
    if (typeof value === 'string') {
      range = document.createRange()
      const walker = document.createTreeWalker(elements[0] ?? document.body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node && !(node.textContent ?? '').includes(value)) node = walker.nextNode()
      if (node) {
        const start = (node.textContent ?? '').indexOf(value)
        range.setStart(node, start)
        range.setEnd(node, start + value.length)
      } else range.selectNodeContents(elements[0] ?? document.body)
    } else if ('setStart' in value && typeof value.setStart === 'function') range = value as Range
    else {
      range = document.createRange()
      range.selectNode(value)
    }
    const box = range.getBoundingClientRect()
    const node = range.startContainer === range.endContainer && range.startOffset === 0 && range.endOffset === (range.startContainer.textContent ?? '').length
      ? range.startContainer
      : typeof value === 'object' && value !== null && !('setStart' in value)
        ? value
        : undefined
    const element = (node?.nodeType === 1 ? node : node?.parentElement) as HTMLElement | undefined
    const writingMode = element ? getComputedStyle(element).writingMode : 'horizontal-tb'
    const inline = node ? graphemeExtent(node, writingMode) : logicalExtent(box, writingMode, 'inline')
    const overflow = element ? excess(element) : { block: 0, inline: 0 }
    const vertical = writingMode.startsWith('vertical')
    const width = vertical ? box.width + overflow.block : Math.max(box.width, inline) + overflow.inline
    const height = vertical ? Math.max(box.height, inline) + overflow.inline : box.height + overflow.block
    return new DOMRect(box.left, box.top, width, height)
  }

  const lineBoxes = (element: Element): MeasuredLineBox[] => measureLines(element, element.getBoundingClientRect().top)

  const runtime: SegnaviaLayoutRuntime = {
    define(implementation) {
      const name = runtime._loading
      const registration = registrations.find((candidate) => candidate.name === name)
      if (!registration) throw new Error('segnaviaLayout.define must run from a registered layout provider script.')
      registration.implementation = implementation
    },
    async run(phase) {
      if (completed.has(phase)) return
      for (const registration of registrations) {
        const implementation = registration.implementation
        if (!implementation)
          throw new Error(`Layout provider ${registration.name} did not call segnaviaLayout.define; add its definition to clear this refusal.`)
        const run = implementation[phase]
        if (!run) continue
        const elements = Array.from(document.querySelectorAll(registration.selects))
        const context: LayoutContext = {
          page: document.documentElement,
          elements,
          ink: (value) => rectFor(value, elements),
          lineBoxes,
          report(data) {
            if (reports.length >= 64) return
            reports.push({
              check: 'layout-report',
              subject: boundedLayoutText(`${registration.name}:${data?.subject ?? ''}`, 256),
              message: boundedLayoutText(data?.message, 1024),
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
    .map(({ name, script }) => `window.segnaviaLayout._loading=${JSON.stringify(name)};\n${script}\nwindow.segnaviaLayout._loading=undefined;`)
    .join('\n')
  return `${embeddedComposerMeasureFunctions()}\n${embedFunction('logicalExtent', logicalExtent)}\n${embedFunction('graphemeInlineExtent', graphemeInlineExtent)}\n${embedFunction('inkExcess', inkExcess)}\n${embedFunction('boundedLayoutText', boundedLayoutText)}\n${embedFunction('installLayoutRuntime', installLayoutRuntime)}\ninstallLayoutRuntime(window,document,setTimeout,clearTimeout,10000,${JSON.stringify(registrations)},measureLineBoxes,graphemeInlineExtent,inkExcess);\n${definitions}`
}

export function withLayoutScripts(html: string, nonce: string, scripts: readonly LoadedLayoutScript[]): string {
  if (scripts.length === 0) return html
  const tag = `<script nonce="${nonce}">${layoutRuntimeScript(scripts)}</script>`
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, () => `${tag}</body>`) : `${html}${tag}`
}

export function layoutReadyBridgeScript(options: { readonly layoutScripts?: readonly LoadedLayoutScript[]; readonly readyAfterAttribute?: string }): {
  declaration: string
  join: string
} {
  if ((options.layoutScripts?.length ?? 0) === 0) return { declaration: '', join: '' }
  const expression = options.readyAfterAttribute
    ? 'null'
    : "window.segnaviaLayout?window.segnaviaLayout.run('galley').then(function(){return window.segnaviaLayout.run('composed');}).catch(function(error){post({type:'segnavia:compose-failure',text:String(error&&error.message||error).slice(0,1024)});return new Promise(function(){});}):null"
  return { declaration: `var layouts=${expression};`, join: ',layouts' }
}
