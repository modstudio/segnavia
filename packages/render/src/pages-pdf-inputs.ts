import { type PageOrPrintedInput } from '@segnavia/format'
import { fillPageAsOfBindings, type SlotPrintOptions } from '@segnavia/html'
import type { InputRefusal } from './errors.ts'
import { inputRefusalLedger } from './input-refusal-ledger.ts'
import { resolveRenderDayContexts } from './page-as-of.ts'
import { expandRenderedPageValue, preparePageInput, prepareRenderedPages } from './page-document.ts'
import { renderPagesPdfInputs } from './pages-pdf.ts'
import { settleRenderInputs } from './render-inputs.ts'
import type { ParsedPagesPdfOptions } from './renderer.ts'
import { pageSlotFillRefusal } from './slot-fill.ts'

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
  const fonts = await prepareRenderedPages(
    expanded.accepted.map(({ value }) => value.expanded),
    options,
    signal,
  )
  const accepted = expanded.accepted.map(({ index, id, value }, position) => ({
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
    refused: [...parsed.refused, ...expanded.refused].sort((left, right) => left.index - right.index),
    days: contexts.days,
  }
}

export function preparePagesPdfSlotInputs(
  inputs: Awaited<ReturnType<typeof preparePagesPdfInputs>>['accepted'],
  slots: SlotPrintOptions | undefined,
) {
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
