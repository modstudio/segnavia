import { APP_FONT_NAME, fontManifestReferences, fontManifestWithReferences, type PageOrPrintedInput } from '@segnavia/format'
import { fillPageAsOfBindings, type SlotPrintOptions } from '@segnavia/html'
import { type InputRefusal, RenderRefusedError } from './errors.ts'
import { inputRefusalLedger } from './input-refusal-ledger.ts'
import { resolveRenderDayContexts } from './page-as-of.ts'
import { expandRenderedPageValue, preparePageInput, prepareRenderedPages } from './page-document.ts'
import { renderPagesPdfInputs } from './pages-pdf.ts'
import { settleRenderInputs } from './render-inputs.ts'
import type { ParsedPagesPdfOptions } from './renderer.ts'
import { pageSlotFillRefusal } from './slot-fill.ts'

function validateInputFonts(
  input: { page: { style?: { fonts?: Parameters<typeof fontManifestWithReferences>[0] } }; fonts: Parameters<typeof fontManifestWithReferences>[1] },
  options: ParsedPagesPdfOptions,
): void {
  const { manifest, undeclared } = fontManifestWithReferences(input.page.style?.fonts, input.fonts)
  const names = fontManifestReferences(manifest, undeclared).map((reference) => ('app' in reference ? reference.app : reference.fallback))
  const invalid = names.find((name) => !APP_FONT_NAME.test(name))
  if (invalid !== undefined) {
    throw new RenderRefusedError(
      `The input could not establish an app font name matching ${APP_FONT_NAME} (${JSON.stringify(invalid)}); use a lowercase name of letters, digits and hyphens to clear this refusal.`,
    )
  }
  if (!options.fontSource && names[0] !== undefined) {
    throw new RenderRefusedError(`The input could not establish app font ${JSON.stringify(names[0])}; supply a FontSource to clear this refusal.`)
  }
}

export async function preparePagesPdfInputs(inputs: readonly PageOrPrintedInput[], options: ParsedPagesPdfOptions, signal: AbortSignal) {
  const parsed = await settleRenderInputs(inputs, (input) => preparePageInput(input, options, signal))
  const contexts = await resolveRenderDayContexts(
    parsed.accepted.map(({ value }) => value.page),
    options,
    signal,
  )
  const expanded = await settleRenderInputs(
    parsed.accepted,
    async (input, position) => {
      const established = contexts.pages[position]
      if (!established) throw new RangeError('A render day could not be established for the input.')
      const value = await expandRenderedPageValue(input.value.page, options, signal, established.day, 'print')
      return { ...input.value, expanded: { ...value, page: fillPageAsOfBindings(value.page, established.day) }, established }
    },
    (input) => input.index,
  )
  const fontEligible = await settleRenderInputs(
    expanded.accepted,
    async (input) => {
      validateInputFonts(input.value.expanded, options)
      return input.value
    },
    (input) => input.index,
  )
  const fonts = await prepareRenderedPages(
    fontEligible.accepted.map(({ value }) => value.expanded),
    options,
    signal,
  )
  const accepted = fontEligible.accepted.map(({ index, id, value }, position) => ({
    index,
    ...(id === undefined ? {} : { id }),
    page: value.expanded.page,
    options: { ...options, preflight: value.expanded.preflight },
    preflight: value.expanded.preflight,
    fontCss: fonts.fontCss,
    fontFailures: fonts.fontFailuresByInput[position] ?? [],
    established: value.established,
    outlineSource: value.outlineSource,
  }))
  return {
    accepted,
    refused: [...parsed.refused, ...expanded.refused, ...fontEligible.refused].sort((left, right) => left.index - right.index),
    days: contexts.days,
  }
}

export function preparePagesPdfSlotInputs(inputs: Awaited<ReturnType<typeof preparePagesPdfInputs>>['accepted'], slots: SlotPrintOptions | undefined) {
  return settleRenderInputs(
    inputs,
    async (input) => {
      const refusal = pageSlotFillRefusal(input.page, slots)
      if (refusal) throw refusal
      return input
    },
    (input) => input.index,
  )
}

export function preparedRenderPagesPdfInputs(
  pages: Parameters<typeof renderPagesPdfInputs>[0],
  frameGroups: Parameters<typeof renderPagesPdfInputs>[1],
  inputs: Awaited<ReturnType<typeof preparePagesPdfInputs>>['accepted'],
) {
  return renderPagesPdfInputs(
    pages,
    frameGroups,
    inputs.map(({ outlineSource }) => outlineSource),
    inputs.map(({ index, id }) => ({ index, ...(id === undefined ? {} : { id }) })),
  )
}

export function captureInputRefusals(option: ParsedPagesPdfOptions['skipRefused'], initial: readonly InputRefusal[]) {
  const ledger = inputRefusalLedger(initial)
  return {
    option:
      option &&
      ({
        report(refused: readonly InputRefusal[]) {
          ledger.add(refused)
        },
      } as const),
    report: () => option?.report(ledger.entries()),
  }
}
