import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import { COPYFIT_GROUP } from '../demo-book-copyfit-fixtures.ts'
import { copyfitFrame } from './book-slot-copyfit.ts'
import type { Harness } from './harness.ts'

export async function verifyBookCopyfit(h: Harness): Promise<void> {
  const group = await (await copyfitFrame(h, 'copyfit-group')).evaluate(
    ({ attribute, group }) => {
      const byId = new Map<string, number>()
      for (const element of document.querySelectorAll<HTMLElement>(`[data-segnavia-pages] [data-fit-group="${group}"]`)) {
        const id = element.getAttribute('data-segnavia-id') ?? ''
        if (!byId.has(id)) byId.set(id, Number.parseFloat(getComputedStyle(element).fontSize))
      }
      const report = JSON.parse(document.documentElement.getAttribute(attribute) ?? 'null') as {
        facts?: { fits?: Array<{ subject: string; group?: string; values: Record<string, string> }> }
      } | null
      return { cards: [...byId], facts: report?.facts?.fits?.filter((fit) => fit.group === group) ?? [] }
    },
    { attribute: PREFLIGHT_ATTRIBUTE, group: COPYFIT_GROUP },
  )
  const screenSizes = new Set(group.cards.map(([, size]) => size))
  h.check('sixteen grouped flashcards share one computed font size on screen', group.cards.length === 16 && screenSizes.size === 1, JSON.stringify(group.cards))
  const server = (await h.page.evaluate(async () => (await fetch('book-copyfit-group-preflight.json')).json())) as {
    facts?: { fits?: Array<{ subject: string; group?: string; values: Record<string, string> }> }
  }
  const serverFacts = server.facts?.fits?.filter((fit) => fit.group === COPYFIT_GROUP) ?? []
  const screenValues = group.facts.map((fit) => [fit.subject, fit.values.size]).sort()
  const serverValues = serverFacts.map((fit) => [fit.subject, fit.values.size]).sort()
  h.check(
    'the sixteen grouped flashcards report the same fit values on screen and in the server PDF render',
    screenValues.length === 16 && JSON.stringify(screenValues) === JSON.stringify(serverValues),
    JSON.stringify({ screenValues, serverValues }),
  )

  const fitted = await copyfitFrame(h, 'copyfit-page-count-fitted')
  const authored = await copyfitFrame(h, 'copyfit-page-count-authored')
  const [fittedCount, authoredCount, fittedSize] = await Promise.all([
    fitted.locator('[data-segnavia-book-page]').count(),
    authored.locator('[data-segnavia-book-page]').count(),
    fitted.locator('[data-segnavia-galley-source] .page-count-copyfit').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ])
  h.check(
    'a fitted chapter has the page count of the same chapter with its fitted size authored',
    fittedSize === 16 && fittedCount === authoredCount,
    JSON.stringify({ fittedSize, fittedCount, authoredCount }),
  )

  const defaultFrame = await copyfitFrame(h, 'copyfit-limit-default')
  const strictFrame = await copyfitFrame(h, 'copyfit-limit-strict')
  const readResult = (frame: typeof defaultFrame) =>
    frame.evaluate((attribute) => {
      const report = JSON.parse(document.documentElement.getAttribute(attribute) ?? 'null') as {
        issues?: Array<{ check: string; subject: string; severity: string; message: string }>
      } | null
      return {
        composed: document.documentElement.hasAttribute('data-segnavia-composed'),
        failure: document.documentElement.getAttribute('data-segnavia-compose-failure'),
        issue: report?.issues?.find((candidate) => candidate.check === 'fit-limit'),
      }
    }, PREFLIGHT_ATTRIBUTE)
  const [defaultResult, strictResult] = await Promise.all([readResult(defaultFrame), readResult(strictFrame)])
  const describesLimit = (result: typeof defaultResult) =>
    result.issue?.subject === 'fit-limit-probe' && /exhausted size at 28 with [\d.]+px excess/.test(result.issue.message)
  h.check(
    'default copyfit composes with a fit-limit warning naming its block, strategy, bound and excess',
    defaultResult.composed && !defaultResult.failure && defaultResult.issue?.severity === 'warning' && describesLimit(defaultResult),
    JSON.stringify(defaultResult),
  )
  h.check(
    'strict copyfit refuses with the fit-limit text',
    !strictResult.composed && strictResult.issue?.severity === 'error' && describesLimit(strictResult) && strictResult.failure === strictResult.issue.message,
    JSON.stringify(strictResult),
  )
}
