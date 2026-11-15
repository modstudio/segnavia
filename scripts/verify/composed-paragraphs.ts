export interface ComposedParagraphLines {
  paragraph: number
  lines: string[]
}

export interface ComposedLineWidthReport {
  paragraphs: number
  maxLines: number
  checked: number
  failures: Array<{ paragraph: number; line: number; width: number; measure: number }>
}

export interface ComposedNoteParagraphReport {
  paragraphs: number
  matches: boolean
  detail: string
}

export function composedParagraphLines(): ComposedParagraphLines[] {
  return Array.from(document.querySelectorAll('p'))
    .map((paragraph, index) => ({
      paragraph: index,
      lines: Array.from(paragraph.querySelectorAll(':scope > span[data-segnavia-line]')).map((line) => line.textContent ?? ''),
    }))
    .filter((paragraph) => paragraph.lines.length > 0)
}

export function composedLineWidthReport(): ComposedLineWidthReport {
  function paragraphReport(paragraph: HTMLElement, paragraphIndex: number) {
    const lines = Array.from(paragraph.querySelectorAll<HTMLElement>(':scope > span[data-segnavia-line]'))
    if (lines.length === 0) return undefined
    const style = getComputedStyle(paragraph)
    const vertical = style.writingMode.startsWith('vertical')
    const box = paragraph.getBoundingClientRect()
    const measure = vertical
      ? box.height -
        (Number.parseFloat(style.paddingBlockStart) || 0) -
        (Number.parseFloat(style.paddingBlockEnd) || 0) -
        (Number.parseFloat(style.borderBlockStartWidth) || 0) -
        (Number.parseFloat(style.borderBlockEndWidth) || 0)
      : box.width -
        (Number.parseFloat(style.paddingInlineStart) || 0) -
        (Number.parseFloat(style.paddingInlineEnd) || 0) -
        (Number.parseFloat(style.borderInlineStartWidth) || 0) -
        (Number.parseFloat(style.borderInlineEndWidth) || 0)
    const measured = lines.flatMap((line, lineIndex) => {
      if (lineIndex === lines.length - 1 || line.style.textAlign === 'start') return []
      const range = document.createRange()
      range.selectNodeContents(line)
      const rect = range.getBoundingClientRect()
      return [{ paragraph: paragraphIndex, line: lineIndex, width: vertical ? rect.height : rect.width, measure }]
    })
    return { lines: lines.length, measured }
  }
  const reports = Array.from(document.querySelectorAll<HTMLElement>('p')).flatMap((paragraph, index) => {
    const report = paragraphReport(paragraph, index)
    return report ? [report] : []
  })
  const measured = reports.flatMap((report) => report.measured)
  return {
    paragraphs: reports.length,
    maxLines: Math.max(0, ...reports.map((report) => report.lines)),
    checked: measured.length,
    failures: measured.filter(({ width, measure }) => Math.abs(width - measure) > 0.5),
  }
}

export function composedNoteParagraphReport(): ComposedNoteParagraphReport {
  function visible(element: HTMLElement, clip: DOMRect): boolean {
    const box = element.getBoundingClientRect()
    return Math.min(box.bottom, clip.bottom) - Math.max(box.top, clip.top) > 0.5
  }
  function reportFor(source: HTMLElement) {
    const sourceLines = source.querySelectorAll(':scope > span[data-segnavia-line]').length
    if (sourceLines === 0) return undefined
    const flow = source.closest<HTMLElement>('[data-segnavia-flow]')
    const flowId = flow?.getAttribute('data-segnavia-flow') ?? ''
    const blocks = flow
      ? Array.from(flow.children).filter((child) => child.tagName !== 'STYLE' && child.tagName !== 'SCRIPT' && !child.hasAttribute('data-side-note'))
      : []
    const blockIndex = blocks.indexOf(source)
    const windows = Array.from(document.querySelectorAll<HTMLElement>(`[data-segnavia-window][data-flow="${CSS.escape(flowId)}"]`))
    const clones = windows.flatMap((window) => {
      const clone = window.querySelector<HTMLElement>(`[data-segnavia-block="${blockIndex}"]`)
      return clone ? [{ window, clone }] : []
    })
    const windowLines = clones.reduce(
      (count, { window, clone }) =>
        count +
        Array.from(clone.querySelectorAll<HTMLElement>(':scope > span[data-segnavia-line]')).filter((line) => visible(line, window.getBoundingClientRect()))
          .length,
      0,
    )
    const refSelector = '.segnavia-note-ref > a[href^="#"]:not([data-segnavia-composition-continuation])'
    const sourceRefs = source.querySelectorAll(refSelector).length
    const windowRefs = clones.reduce(
      (count, { window, clone }) =>
        count + Array.from(clone.querySelectorAll<HTMLElement>(refSelector)).filter((ref) => visible(ref, window.getBoundingClientRect())).length,
      0,
    )
    return {
      matches: sourceLines === windowLines && sourceRefs === windowRefs,
      detail: `${flowId}:${blockIndex} lines=${sourceLines}/${windowLines} refs=${sourceRefs}/${windowRefs}`,
    }
  }
  const sources = Array.from(document.querySelectorAll<HTMLElement>('[data-segnavia-galley-source] p:has(.segnavia-note-ref > a[href^="#"])'))
  const reports = sources.flatMap((source) => {
    const report = reportFor(source)
    return report ? [report] : []
  })
  return { paragraphs: reports.length, matches: reports.every((report) => report.matches), detail: reports.map((report) => report.detail).join('|') }
}
