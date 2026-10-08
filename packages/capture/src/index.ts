// Runs a host's flows and records the shots each produced. A flow writes into
// a staging directory of its own, and only a flow that finishes has its shots
// moved into the output and listed in the manifest, so a failure partway
// leaves the previous capture of every one of its screens in place.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Manifest, type Shot } from '@segnavia/format'
import { type Browser, type BrowserContextOptions, chromium, type Page } from 'playwright-core'
import type { FlowIdentity, Host, HostSession } from './host.ts'
import { type ImageOutput, type ShotSpec, takeShot } from './shot.ts'

export { chooseArrowSide, layoutAnnotation } from './geometry.ts'
export type { FlowIdentity, Host, HostSession } from './host.ts'
export type { ImageOutput, ShotSpec, Target } from './shot.ts'

export interface FlowContext<Extras> {
  flow: string
  page: Page
  extras: Extras
  log(message: string): void
  currentStep(): string
  step<T>(name: string, body: () => Promise<T>): Promise<T>
  goto(url: string): Promise<void>
  // Waits for a condition in the page, failing with what was awaited rather
  // than a bare timeout.
  until(predicate: string | ((arg: unknown) => unknown), what: string, options?: { arg?: unknown; timeout?: number }): Promise<void>
  viewport(size?: { width: number; height: number }): Promise<void>
  setLocalStorage(entries: Record<string, string | number | boolean>): Promise<void>
  shot(spec: ShotSpec): Promise<Shot>
}

export interface Flow<Extras> extends FlowIdentity {
  run(flow: FlowContext<Extras>): Promise<void>
}

export interface CaptureConfig {
  baseUrl: string
  outputDirectory: string
  executablePath: string
  launchArgs?: string[]
  viewport?: { width: number; height: number }
  scale?: number
  // Applied under every flow's context, before the host's own options.
  context?: BrowserContextOptions
  output?: ImageOutput
  // Flow names, or dotted prefixes of them, to run; all when empty.
  flows?: string[]
  // Values every shot records, such as the app's version.
  meta?: Record<string, unknown>
  log?: (message: string) => void
}

export interface FlowResult {
  name: string
  ok: boolean
  error?: string
  failureScreenshot?: string
  shots: Shot[]
}

export interface CaptureRun {
  results: FlowResult[]
  manifest: Manifest
  ok: boolean
}

const DEFAULTS = { viewport: { width: 1280, height: 720 }, scale: 2, output: { format: 'png' } as ImageOutput }

export function selectFlows<F extends { name: string }>(flows: F[], requested?: string[]): F[] {
  if (!requested || requested.length === 0) return flows
  const matches = (flow: F, name: string) => flow.name === name || flow.name.startsWith(`${name}.`)
  const unknown = requested.filter((name) => !flows.some((flow) => matches(flow, name)))
  if (unknown.length > 0) throw new Error(`No flow is named ${unknown.join(', ')}. Flows: ${flows.map((flow) => flow.name).join(', ')}`)
  return flows.filter((flow) => requested.some((name) => matches(flow, name)))
}

function injectStyle(css: string) {
  const apply = () => {
    const style = document.createElement('style')
    style.textContent = css
    document.documentElement.appendChild(style)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply)
  else apply()
}

type Resolved = Required<Pick<CaptureConfig, 'viewport' | 'scale' | 'output'>> & CaptureConfig & { log: (message: string) => void }

async function runFlow<Extras>(flow: Flow<Extras>, browser: Browser, session: HostSession<Extras>, config: Resolved): Promise<FlowResult> {
  const staging = path.join(config.outputDirectory, '.staging', flow.name)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  const identity: FlowIdentity = { name: flow.name, session: flow.session }
  const shots: Shot[] = []
  const state = { step: 'setting up', number: 0 }
  const context = await browser.newContext({
    baseURL: config.baseUrl,
    viewport: config.viewport,
    deviceScaleFactor: config.scale,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    ...config.context,
    ...session.context,
    ...(session.contextFor ? await session.contextFor(identity) : {}),
  })
  // Registered before the first page opens, so it reaches every document.
  if (session.injectCss) await context.addInitScript(injectStyle, session.injectCss)
  const page = await context.newPage()
  try {
    if (session.observe) page.on('response', (response) => session.observe?.(response, identity))
    const flowContext: FlowContext<Extras> = {
      flow: flow.name,
      page,
      extras: session.extras ? await session.extras(page, identity) : ({} as Extras),
      log: (message) => config.log(`    ${message}`),
      currentStep: () => state.step,
      async step(name, body) {
        state.step = name
        state.number += 1
        config.log(`  ${flow.name} › ${name}`)
        return body()
      },
      async goto(url) {
        await session.beforeNavigate?.(url)
        await page.goto(url)
      },
      async until(predicate, what, options = {}) {
        const timeout = options.timeout ?? 30000
        try {
          await page.waitForFunction(predicate, options.arg, { timeout })
        } catch {
          throw new Error(`waited ${timeout / 1000}s for ${what}`)
        }
      },
      async viewport(size) {
        await page.setViewportSize(size ?? config.viewport)
      },
      async setLocalStorage(entries) {
        if (!page.url().startsWith(config.baseUrl)) await flowContext.goto('/')
        await page.evaluate((pairs) => {
          for (const [key, value] of Object.entries(pairs)) localStorage.setItem(key, String(value))
        }, entries)
      },
      async shot(spec) {
        const refusal = session.refuseShot?.(spec, identity)
        if (refusal) throw new Error(`Step "${state.step}": ${refusal}`)
        if (shots.some((shot) => shot.key === spec.key)) throw new Error(`Shot key ${spec.key} is taken twice in ${flow.name}.`)
        const shot = await takeShot(page, spec, { step: state.step, directory: staging, scale: config.scale, output: config.output })
        // Steps are numbered from one in the order a flow takes them.
        const recorded = { ...shot, meta: { ...config.meta, ...shot.meta, flow: flow.name, step: Math.max(state.number, 1), stepName: state.step } }
        shots.push(recorded)
        config.log(`    captured ${spec.key}`)
        return recorded
      },
    }
    await flow.run(flowContext)
    for (const shot of shots) {
      for (const file of [shot.file, shot.annotatedFile]) if (file) renameSync(path.join(staging, file), path.join(config.outputDirectory, file))
    }
    return { name: flow.name, ok: true, shots }
  } catch (error) {
    const failureScreenshot = path.join(config.outputDirectory, '.failures', `${flow.name}.png`)
    mkdirSync(path.dirname(failureScreenshot), { recursive: true })
    await page.screenshot({ path: failureScreenshot }).catch(() => {})
    const message = (error as Error).message.split('\n')[0] ?? ''
    return { name: flow.name, ok: false, error: message.startsWith('Step "') ? message : `Step "${state.step}": ${message}`, failureScreenshot, shots: [] }
  } finally {
    await context.close()
    rmSync(staging, { recursive: true, force: true })
  }
}

function writeManifest(directory: string, results: FlowResult[]): Manifest {
  const file = path.join(directory, 'manifest.json')
  const manifest: Manifest = existsSync(file) ? Manifest.parse(JSON.parse(readFileSync(file, 'utf8'))) : { shots: {}, updatedAt: '' }
  for (const shot of results.flatMap((result) => result.shots)) manifest.shots[shot.key] = shot
  manifest.updatedAt = new Date().toISOString()
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function capture<Extras>(host: Host<Extras>, flows: Flow<Extras>[], config: CaptureConfig): Promise<CaptureRun> {
  const resolved: Resolved = { ...DEFAULTS, ...config, log: config.log ?? (() => {}) }
  const selected = selectFlows(flows, config.flows)
  mkdirSync(resolved.outputDirectory, { recursive: true })
  const browser = await chromium.launch({
    executablePath: resolved.executablePath,
    args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', ...(config.launchArgs ?? [])],
  })
  const results: FlowResult[] = []
  try {
    const session = await host.open({ browser, baseUrl: resolved.baseUrl })
    try {
      for (const flow of selected) {
        resolved.log(`flow ${flow.name}`)
        const result = await runFlow(flow, browser, session, resolved)
        resolved.log(result.ok ? `  ok: ${result.shots.length} shots` : `  FAILED: ${result.error}`)
        results.push(result)
      }
    } finally {
      await session.close?.()
    }
  } finally {
    await browser.close()
  }
  const manifest = writeManifest(resolved.outputDirectory, results)
  writeFileSync(path.join(resolved.outputDirectory, 'report.json'), `${JSON.stringify({ meta: config.meta ?? {}, flows: results }, null, 2)}\n`)
  return { results, manifest, ok: results.every((result) => result.ok) }
}
