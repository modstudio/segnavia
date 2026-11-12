import { embedFunction } from '@segnavia/html'
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
  lineBoxes(element: Element): readonly DOMRect[]
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
    } else if ('getBoundingClientRect' in value) range = value as Range
    else {
      range = document.createRange()
      range.selectNode(value)
    }
    const boxes = Array.from(range.getClientRects()).filter((box) => box.width > 0 || box.height > 0)
    if (boxes.length === 0) return range.getBoundingClientRect()
    const left = Math.min(...boxes.map((box) => box.left))
    const top = Math.min(...boxes.map((box) => box.top))
    const right = Math.max(...boxes.map((box) => box.right))
    const bottom = Math.max(...boxes.map((box) => box.bottom))
    return new DOMRect(left, top, right - left, bottom - top)
  }

  const lineBoxes = (element: Element): DOMRect[] => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return Array.from(range.getClientRects())
  }

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
        if (!implementation) throw new Error(`Layout provider ${registration.name} did not call segnaviaLayout.define; add its definition to clear this refusal.`)
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
            () => reject(new Error(`Layout provider ${registration.name} did not settle its ${phase} phase within ${timeoutMs}ms; make the phase settle to clear this refusal.`)),
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
  return `${embedFunction('boundedLayoutText', boundedLayoutText)}\n${embedFunction('installLayoutRuntime', installLayoutRuntime)}\ninstallLayoutRuntime(window,document,setTimeout,clearTimeout,10000,${JSON.stringify(registrations)});\n${definitions}`
}

export function withLayoutScripts(html: string, nonce: string, scripts: readonly LoadedLayoutScript[]): string {
  if (scripts.length === 0) return html
  const tag = `<script nonce="${nonce}">${layoutRuntimeScript(scripts)}</script>`
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, () => `${tag}</body>`) : `${html}${tag}`
}
