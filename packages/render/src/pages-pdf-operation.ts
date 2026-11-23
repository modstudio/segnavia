import type { PageOrPrintedInput } from '@segnavia/format'
import { printedPageAuthorHtml, printedPageDirection } from '@segnavia/html'
import type { TabRunner } from './browser-tab.ts'
import { withDocumentMetadata } from './document-metadata.ts'
import { fontFaces } from './font-faces.ts'
import { innerLimits } from './options.ts'
import { outputDate } from './output-date.ts'
import { renderPagePdf, renderPiecePdf } from './page-render.ts'
import { renderPagesPdf } from './pages-pdf.ts'
import { captureInputRefusals, preparedRenderPagesPdfInputs, preparePagesPdfInputs, preparePagesPdfSlotInputs } from './pages-pdf-inputs.ts'
import { enforce } from './pdf-finish.ts'
import { finishPdfWithBrowser } from './pdf-output.ts'
import { withPreflightSeed } from './preflight.ts'
import { composeProgressReport, renderProgressReporter, renderProgressStages } from './progress.ts'
import type { ProtectPdf } from './protect-pdf.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { resolveRenderLayoutScripts } from './render-layout-scripts.ts'
import type { ParsedPagesPdfOptions } from './renderer.ts'
import { effectiveCopySlots, renderSlotCopyPdfs } from './slot-copies.ts'
import { slotCopyProgress } from './slot-copy-progress.ts'
import { filledPages } from './slot-fill.ts'
import { watermarkCopyStamper } from './watermark-stamp.ts'

export async function renderPagesPdfOperation(
  inputs: PageOrPrintedInput[],
  parsedOptions: ParsedPagesPdfOptions,
  deadline: RenderDeadline,
  withTab: TabRunner,
  protectPdf: ProtectPdf,
): Promise<Uint8Array> {
  const preparedInputs = await preparePagesPdfInputs(inputs, parsedOptions, deadline.signal)
  const refusedInputs = captureInputRefusals(parsedOptions.skipRefused, preparedInputs.refused)
  const renderOptions = { ...parsedOptions, ...(refusedInputs.option ? { skipRefused: refusedInputs.option } : {}) }
  const acceptedByIndex = new Map(preparedInputs.accepted.map((input) => [input.index, input]))
  const stages = renderProgressStages({
    compose: preparedInputs.accepted.some(({ page }) => Boolean(page.printedPages)),
    set: true,
    impose: Boolean(parsedOptions.imposition),
    finish: true,
  })
  const progress = renderProgressReporter(parsedOptions.progress, stages)
  const copyCount = parsedOptions.slots?.fills?.length ?? 1
  const watermarkCopies = watermarkCopyStamper(parsedOptions, preparedInputs.accepted[0]?.fontCss ?? '', deadline, withTab)
  const bytes = await renderSlotCopyPdfs(parsedOptions.slots, async (copySlots, copyIndex) => {
    const copyReporter = slotCopyProgress(progress, copyIndex, copyCount)
    const effectiveSlots = effectiveCopySlots(parsedOptions.slots, copySlots, preparedInputs.accepted[0]?.established.slots)
    const slotInputs = await preparePagesPdfSlotInputs(preparedInputs.accepted, effectiveSlots)
    const survivingInputs = slotInputs.accepted.map(({ value }) => value)
    const {
      value: pages,
      slots,
      frameGroups,
    } = await filledPages(
      survivingInputs.map(({ page }) => page),
      effectiveSlots,
      deadline.signal,
    )
    const resolvedLayoutScripts = await resolveRenderLayoutScripts(pages.map(printedPageAuthorHtml).join(''))
    return renderPagesPdf(
      pages,
      slots,
      { ...renderOptions, limits: innerLimits(renderOptions.limits), press: undefined },
      {
        pagePdf: async (page, slots, options, inputIndex, tagged) => {
          const accepted = acceptedByIndex.get(inputIndex)
          const rendered = await renderPagePdf(
            page,
            slots,
            { ...options, preflight: withPreflightSeed(options.preflight, accepted?.preflight) },
            { withTab },
            inputIndex,
            deadline,
            accepted?.fontCss ?? '',
            accepted?.fontFailures ?? [],
            resolvedLayoutScripts,
            Boolean(parsedOptions.watermark),
            tagged,
            composeProgressReport(copyReporter, inputIndex),
          )
          copyReporter.report('set', 1, 1, inputIndex)
          return rendered
        },
        piecePdf: (page, slots, geometry, css, options, tagged) =>
          renderPiecePdf(page, slots, geometry, css, options, { withTab }, deadline, resolvedLayoutScripts, Boolean(parsedOptions.watermark), tagged),
        fontFaces: (options) => `${preparedInputs.accepted[0]?.fontCss ?? ''}${fontFaces(options.fonts, options.origins)}`,
        finish: async (pdf) => pdf,
        watermark: watermarkCopies.stamp,
        progress: copyReporter,
      },
      preparedRenderPagesPdfInputs(pages, frameGroups, survivingInputs),
      [...preparedInputs.refused, ...slotInputs.refused],
    )
  })
  watermarkCopies.validate()
  const output = await enforce(
    await withDocumentMetadata(
      await finishPdfWithBrowser(bytes, parsedOptions, withTab, deadline, progress),
      parsedOptions.metadata,
      outputDate(preparedInputs.days),
      preparedInputs.accepted[0] ? printedPageDirection(preparedInputs.accepted[0].page) : undefined,
    ),
    parsedOptions.limits,
  )
  const protectedOutput = await protectPdf(output, parsedOptions, deadline)
  if (parsedOptions.skipRefused) refusedInputs.report()
  return protectedOutput
}
