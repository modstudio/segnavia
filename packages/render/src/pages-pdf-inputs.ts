import { type PageOrPrintedInput, pageOrPrintedFromDocument } from '@segnavia/format'
import { documentOutlineSource, fillPageAsOfBindings, parseDocument, resolveEdition } from '@segnavia/html'
import { resolveRenderBrand } from './brand.ts'
import type { InputRefusal } from './errors.ts'
import { resolveRenderDayContexts } from './page-as-of.ts'
import { expandRenderedPageValue, prepareExpandedRenderedPage } from './page-document.ts'
import { settleRenderInputs } from './render-inputs.ts'
import type { ParsedPagesPdfOptions } from './renderer.ts'

export async function preparePagesPdfInputs(
  inputs: readonly PageOrPrintedInput[],
  options: ParsedPagesPdfOptions,
  signal: AbortSignal,
): Promise<{ accepted: Awaited<ReturnType<typeof prepareInput>>[]; refused: InputRefusal[] }> {
  const parsed = await settleRenderInputs(inputs, (input, index) => parseInput(input, index, options, signal))
  const contexts = await resolveRenderDayContexts(
    parsed.accepted.map(({ value }) => value.page),
    options,
    signal,
  )
  const prepared = await settleRenderInputs(
    parsed.accepted.map(({ value }) => value),
    (input, position) => {
      const established = contexts.pages[position]
      if (!established) throw new RangeError('A render day could not be established for the input.')
      return prepareInput(input, options, signal, established)
    },
    (input) => input.index,
  )
  return { accepted: prepared.accepted.map(({ value }) => value), refused: [...parsed.refused, ...prepared.refused].sort((a, b) => a.index - b.index) }
}

export function captureInputRefusals(option: ParsedPagesPdfOptions['skipRefused'], initial: readonly InputRefusal[]) {
  const entries = new Map(initial.map((entry) => [entry.index, entry]))
  return {
    option:
      option &&
      ({
        report(refused: readonly InputRefusal[]) {
          for (const entry of refused) entries.set(entry.index, entry)
        },
      } as const),
    report: () => option?.report([...entries.values()].sort((left, right) => left.index - right.index)),
  }
}

async function parseInput(input: PageOrPrintedInput, index: number, options: ParsedPagesPdfOptions, signal: AbortSignal) {
  const document = resolveEdition(parseDocument(input, { newId: options.newId }), options.edition)
  const brand = await resolveRenderBrand(document, options.brandSource, signal)
  const page = pageOrPrintedFromDocument(document, brand)
  return { index, id: document.id, document, page }
}

async function prepareInput(
  input: Awaited<ReturnType<typeof parseInput>>,
  options: ParsedPagesPdfOptions,
  signal: AbortSignal,
  established: Awaited<ReturnType<typeof resolveRenderDayContexts>>['pages'][number],
) {
  const expanded = await expandRenderedPageValue(input.page, options, signal, established.day, 'print')
  const prepared = await prepareExpandedRenderedPage({ ...expanded, page: fillPageAsOfBindings(expanded.page, established.day) }, options, signal, established)
  return {
    ...prepared,
    preflight: expanded.preflight,
    index: input.index,
    id: input.id,
    outlineSource: input.document.kind === 'printed' ? documentOutlineSource(input.document) : undefined,
  }
}
