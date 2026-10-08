// Every capture seam, from what the demo run recorded: sessions per flow,
// helpers per flow, waits before navigation, a refused shot, flow helpers,
// every kind of target, and a failure that names its step and keeps nothing.

import '../source-guard.ts'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Manifest } from '@segnavia/format'
import { type Harness, ROOT } from './harness.ts'
import { imageSize } from './image-size.ts'

interface Facts {
  observed: { navigations: number; extrasBuilt: string[]; rateLimited: string[]; hiddenAfterNavigation: boolean[] }
  outputFacts: {
    bytes90: number
    bytes80: number
    ceiling: number
    fallbackBytes: number
    referencesOk: boolean
    fallbackOk: boolean
    scalePngOk: boolean
    tooSmall: { ok: boolean; error?: string }
  }
  results: Array<{ name: string; ok: boolean; error?: string; failureScreenshot?: string }>
}

interface Report {
  flows: Array<{ name: string; ok: boolean }>
}

function qualityFallbackWorked(facts: Facts['outputFacts']): boolean {
  return facts.referencesOk && facts.bytes80 < facts.ceiling && facts.bytes90 > facts.ceiling && facts.fallbackOk && facts.fallbackBytes === facts.bytes80
}

function verifyFailedFlows(h: Harness, facts: Facts, manifest: Manifest) {
  const result = (name: string) => facts.results.find((candidate) => candidate.name === name)
  const refused = result('refused')
  h.check(
    'a host refuses a shot taken while the API rate-limited the page',
    refused?.ok === false && (refused.error ?? '').includes('rate-limited') && facts.observed.rateLimited.includes('refused'),
    refused?.error,
  )
  const broken = result('broken')
  h.check(
    'a missing target fails its flow, naming the step and the locator',
    broken?.ok === false && (broken.error ?? '').startsWith('Step "open the class list": getByRole("button", { name: Archive })'),
    broken?.error,
  )
  h.check(
    'a target matching two visible elements fails its flow',
    result('ambiguous')?.ok === false && (result('ambiguous')?.error ?? '').includes('matched 2 visible elements; expected exactly one'),
    result('ambiguous')?.error,
  )
  h.check(
    'a unique target outside the viewport fails its flow',
    result('outside')?.ok === false && (result('outside')?.error ?? '').includes('is not fully inside the 1280x720 viewport'),
    result('outside')?.error,
  )
  h.check(
    'a failed flow leaves a screenshot of the moment and writes none of its shots',
    Boolean(broken?.failureScreenshot && existsSync(broken.failureScreenshot)) &&
      !manifest.shots['broken.missing'] &&
      !existsSync(path.join(ROOT, 'out/shots/broken.missing.webp')),
  )
  h.check(
    'a failed flow publishes none of its staged shots and preserves the previous shot for that key',
    result('transaction')?.ok === false &&
      manifest.shots['transaction.kept']?.title === 'Previously published' &&
      !manifest.shots['transaction.never'] &&
      !existsSync(path.join(ROOT, 'out/shots/transaction.never.webp')),
    `${result('transaction')?.error}; kept=${manifest.shots['transaction.kept']?.title}`,
  )
}

export function verifyCapture(h: Harness) {
  const { check } = h
  const facts = JSON.parse(readFileSync(path.join(ROOT, 'out/capture-facts.json'), 'utf8')) as Facts
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'out/shots/manifest.json'), 'utf8')) as Manifest
  const report = JSON.parse(readFileSync(path.join(ROOT, 'out/shots/report.json'), 'utf8')) as Report
  const result = (name: string) => facts.results.find((r) => r.name === name)

  check(
    'a guest flow runs signed out: its "Sign in" target exists only without the session',
    result('guest')?.ok === true && Boolean(manifest.shots['guest.home']),
  )
  check(
    'a signed-in flow depends on UI that exists only with its session',
    result('signed-in')?.ok === true && manifest.shots['signed.home']?.annotations.length === 1,
  )
  check('helpers are built per flow', facts.observed.extrasBuilt.length === facts.results.length, facts.observed.extrasBuilt.join(','))
  check('every navigation waits on the host first', facts.observed.navigations === 18, `navigations=${facts.observed.navigations}`)
  const list = manifest.shots['classes.list']
  const form = manifest.shots['classes.create.form']
  check(
    "successive shots carry increasing steps and each step's name",
    list?.meta.step === 1 && list.meta.stepName === 'open the class list' && form?.meta.step === 2 && form.meta.stepName === 'open the new class form',
    `${String(list?.meta.step)}:${String(list?.meta.stepName)},${String(form?.meta.step)}:${String(form?.meta.stepName)}`,
  )
  const compact = manifest.shots['classes.compact']
  check('setLocalStorage, until and viewport shape the shot', compact?.size.width === 800 && compact.size.height === 600, JSON.stringify(compact?.size))
  check('text and css targets, with exact off, both annotate', compact?.annotations.length === 2 && compact.annotations[1]?.arrow?.label === 'Add')
  check(
    'a shot keeps its description and tags',
    compact?.description === 'A narrower window, with the compact layout chosen.' && compact.tags.join() === 'layout',
  )
  check('the app version reaches every shot', compact?.meta.appVersion === 'demo-1')
  check(
    "the host's hide CSS reaches every document after navigation, including a toast",
    facts.observed.hiddenAfterNavigation.length === 2 && facts.observed.hiddenAfterNavigation.every(Boolean),
    JSON.stringify(facts.observed.hiddenAfterNavigation),
  )
  const delayed = manifest.shots['delayed.complete']
  check('until waits for a delayed condition before capturing', (delayed?.annotations[0]?.ring?.y ?? 0) > 180, JSON.stringify(delayed?.annotations[0]?.ring))
  const settled = manifest.shots['settling.complete']
  check('capture settles a late image before taking the shot', (settled?.annotations[0]?.ring?.y ?? 0) > 180, JSON.stringify(settled?.annotations[0]?.ring))
  const webp = imageSize(readFileSync(path.join(ROOT, 'out/shots/classes.list.webp')))
  const png = imageSize(readFileSync(path.join(ROOT, 'out/capture-scale-png/output.sample.png')))
  check(
    'captured WebP and PNG pixel sizes reflect the chosen scale',
    webp?.width === 2560 && webp.height === 1440 && facts.outputFacts.scalePngOk && png?.width === 640 && png.height === 400,
    JSON.stringify({ webp, png }),
  )
  check('a byte ceiling low enough uses the next WebP quality', qualityFallbackWorked(facts.outputFacts), JSON.stringify(facts.outputFacts))
  check(
    'a byte ceiling below every quality refuses the shot',
    !facts.outputFacts.tooSmall.ok && (facts.outputFacts.tooSmall.error ?? '').includes('larger than 1 bytes at every quality tried'),
    facts.outputFacts.tooSmall.error,
  )
  verifyFailedFlows(h, facts, manifest)
  check(
    "report.json names every flow's outcome",
    report.flows.length === facts.results.length && report.flows.every((flow) => result(flow.name)?.ok === flow.ok),
    report.flows.map((flow) => `${flow.name}:${flow.ok}`).join(','),
  )
  check('capturing a key again replaces its manifest entry', manifest.shots['replacement.same']?.title === 'Second version')
}
