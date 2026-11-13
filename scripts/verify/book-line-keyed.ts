import type { Harness } from './harness.ts'

interface LineKeyedFact {
  id: string
  number: string
  marginNumber: string
  lemma: string
  labelLemma: string
  calls: number
  direction: string
  separator: string
}

interface LineKeyedSpacing {
  noteGap: number
  ordinaryGap: number
}

function lineKeyedFacts(): LineKeyedFact[] {
  const source = document.querySelector('[data-segnavia-galley-source]')
  return Array.from(source?.querySelectorAll<HTMLElement>('[data-segnavia-line-label]') ?? []).map((label) => {
    const id = label.dataset.segnaviaLineLabel ?? ''
    const anchor = source?.querySelector<HTMLElement>(`[data-segnavia-line-note-anchor="${id}"]`)
    const placedAnchor = Array.from(document.querySelectorAll<HTMLElement>(`[data-segnavia-line-note-anchor="${id}"]`)).find(
      (candidate) => !candidate.closest('[data-segnavia-galley-source]'),
    )
    const page = placedAnchor?.closest<HTMLElement>('[data-segnavia-book-page]')
    const anchorBox = placedAnchor?.getBoundingClientRect()
    const numbers = Array.from(page?.querySelectorAll<HTMLElement>('[data-segnavia-line-number]') ?? [])
    const margin = anchorBox
      ? numbers.sort(
          (left, right) => Math.abs(left.getBoundingClientRect().top - anchorBox.top) - Math.abs(right.getBoundingClientRect().top - anchorBox.top),
        )[0]
      : undefined
    const number = label.querySelector<HTMLElement>('[data-segnavia-line-number]')?.textContent ?? ''
    const bdis = label.querySelectorAll('bdi')
    const text = label.textContent ?? ''
    return {
      id,
      number,
      marginNumber: margin?.textContent ?? '',
      lemma: anchor?.hasAttribute('data-lemma') ? (anchor.textContent ?? '') : '',
      labelLemma: bdis[1]?.textContent ?? '',
      calls: source?.querySelectorAll('.segnavia-note-ref').length ?? 0,
      direction: getComputedStyle(label.closest('p') ?? label).direction,
      separator: text.includes(']') ? ']' : '',
    }
  })
}

function lineKeyedSpacing(): LineKeyedSpacing {
  const source = document.querySelector('[data-segnavia-galley-source]')
  const lemma = source?.querySelector<HTMLElement>('[data-line-keyed-case="wrapping"]')
  const next = source?.querySelector<HTMLElement>('[data-line-keyed-next]')
  const before = source?.querySelector<HTMLElement>('[data-line-keyed-space-before]')
  const after = source?.querySelector<HTMLElement>('[data-line-keyed-space-after]')
  const characterBox = (element: HTMLElement, end: boolean) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node instanceof Text && node.data.length > 0) nodes.push(node)
    const node = end ? nodes.at(-1) : nodes[0]
    if (!node) return element.getBoundingClientRect()
    const range = document.createRange()
    const offset = end ? node.data.length : 0
    range.setStart(node, end ? offset - 1 : offset)
    range.setEnd(node, end ? offset : offset + 1)
    return range.getBoundingClientRect()
  }
  const gap = (left: HTMLElement | null | undefined, right: HTMLElement | null | undefined) => {
    if (!left || !right) return Number.NaN
    const leftBox = characterBox(left, true)
    const rightBox = characterBox(right, false)
    return Math.max(leftBox.left, rightBox.left) - Math.min(leftBox.right, rightBox.right)
  }
  return { noteGap: gap(lemma, next), ordinaryGap: gap(before, after) }
}

export async function verifyBookLineKeyed(h: Harness) {
  await h.page.goto(h.url('book-line-keyed.html'))
  for (const language of ['en', 'he'] as const) {
    const frame = h.page.frameLocator(`#book-line-keyed-${language} iframe[data-segnavia-book-layout="pages"]`)
    await frame.locator('html[data-segnavia-composed],html[data-segnavia-compose-failure]').waitFor({ timeout: 20_000, state: 'attached' })
    const failure = await frame.locator('html').getAttribute('data-segnavia-compose-failure')
    if (failure) throw new Error(`book-line-keyed-${language} composition failed: ${failure}`)
    const facts = await frame.locator('html').evaluate(lineKeyedFacts)
    const spacing = await frame.locator('html').evaluate(lineKeyedSpacing)
    const shared = facts.slice(1, 3)
    h.check(
      `book-line-keyed-${language} matches lemma-start line numbers and leaves no calls`,
      facts.length === 4 &&
        facts.every((fact) => fact.number !== '' && fact.number === fact.marginNumber && fact.lemma === fact.labelLemma && fact.calls === 0) &&
        shared[0]?.number === shared[1]?.number &&
        (language === 'en' || facts.every((fact) => fact.direction === 'rtl' && fact.separator === (fact.lemma ? ']' : ''))),
      JSON.stringify(facts),
    )
    h.check(
      `book-line-keyed-${language} leaves one ordinary word space around a natural note`,
      Number.isFinite(spacing.noteGap) && Math.abs(spacing.noteGap - spacing.ordinaryGap) <= 0.5,
      JSON.stringify(spacing),
    )
  }
}
