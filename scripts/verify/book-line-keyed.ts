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

function lineKeyedFacts(): LineKeyedFact[] {
  const source = document.querySelector('[data-segnavia-galley-source]')
  return Array.from(source?.querySelectorAll<HTMLElement>('[data-segnavia-line-label]') ?? []).map((label) => {
    const id = label.dataset.segnaviaLineLabel ?? ''
    const anchor = source?.querySelector<HTMLElement>(`[data-segnavia-line-note-anchor="${id}"]`)
    const sourceBox = anchor?.getBoundingClientRect()
    const placedAnchor = Array.from(document.querySelectorAll<HTMLElement>(`[data-segnavia-line-note-anchor="${id}"]`)).find((candidate) => !candidate.closest('[data-segnavia-galley-source]'))
    const page = placedAnchor?.closest<HTMLElement>('[data-segnavia-book-page]')
    const anchorBox = placedAnchor?.getBoundingClientRect()
    const numbers = Array.from(page?.querySelectorAll<HTMLElement>('[data-segnavia-line-number]') ?? [])
    const margin = anchorBox ? numbers.sort((left, right) => Math.abs(left.getBoundingClientRect().top - anchorBox.top) - Math.abs(right.getBoundingClientRect().top - anchorBox.top))[0] : undefined
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

export async function verifyBookLineKeyed(h: Harness) {
  const pageErrors: string[] = []
  h.page.on('pageerror', (error) => pageErrors.push(error.message))
  await h.page.goto(h.url('book-line-keyed.html'))
  for (const language of ['en', 'he'] as const) {
    const frame = h.page.frameLocator(`#book-line-keyed-${language} iframe[data-segnavia-book-layout="pages"]`)
    await frame
      .locator('html[data-segnavia-composed],html[data-segnavia-compose-failure]')
      .waitFor({ timeout: 60_000, state: 'attached' })
      .catch(() => {
        throw new Error(`book-line-keyed-${language} did not finish composition: ${pageErrors.join('; ') || 'no page error was reported'}`)
      })
    const failure = await frame.locator('html').getAttribute('data-segnavia-compose-failure')
    if (failure) throw new Error(`book-line-keyed-${language} composition failed: ${failure}`)
    const facts = await frame.locator('html').evaluate(lineKeyedFacts)
    const shared = facts.slice(1, 3)
    h.check(
      `book-line-keyed-${language} matches lemma-start line numbers and leaves no calls`,
      facts.length === 4 &&
        facts.every((fact) => fact.number !== '' && fact.number === fact.marginNumber && fact.lemma === fact.labelLemma && fact.calls === 0) &&
        shared[0]?.number === shared[1]?.number &&
        (language === 'en' || facts.every((fact) => fact.direction === 'rtl' && fact.separator === (fact.lemma ? ']' : ''))),
      JSON.stringify(facts),
    )
  }
}
