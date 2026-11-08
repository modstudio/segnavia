import type { DocumentInput } from '@segnavia/format'
import { type Renderer, RenderRefusedError } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

const paragraph = (id: string, text: string) => `<p data-segnavia-id="${id}">${text}</p>`
const fixtureIds = () => {
  let id = 0
  return () => `plan-fixture-${++id}`
}

function planFixture(second: string): DocumentInput {
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Saved plan proof' },
    mode: 'paginated',
    settings: { lang: 'en' },
    page: { paper: 'a5', margin: { blockStart: 16, blockEnd: 16, inlineStart: 18, inlineEnd: 12 } },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            title: 'Chapter',
            children: [{ type: 'flow', html: `${paragraph('before', 'Short opening. '.repeat(18))}${paragraph('forced', second)}` }],
          },
        ],
      },
    ],
  }
}

export async function verifyBookPlan(renderer: Renderer, check: Check): Promise<void> {
  const css = ':where(html){font:16px/24px serif}'
  const book = planFixture('Short continuation. '.repeat(18))
  const plan = await renderer.bookPlan(book, { css, newId: fixtureIds() })
  await renderer.bookPdf(book, { css, plan, newId: fixtureIds() })
  check('an unchanged saved book plan replays', plan.pages.length > 0, `${plan.pages.length} pages`)

  let stale = ''
  try {
    await renderer.bookPdf(planFixture('Changed paragraph text. '.repeat(500)), { css, plan, newId: fixtureIds() })
  } catch (error) {
    stale = error instanceof RenderRefusedError ? error.message : String(error)
  }
  check('a changed paragraph refuses its saved plan and names a page', /page \d+/.test(stale), stale)

  const forced = await renderer.bookPlan(book, { css, breaks: ['forced'], newId: fixtureIds() })
  let replayed = true
  try {
    await renderer.bookPdf(book, { css, plan: forced, newId: fixtureIds() })
  } catch {
    replayed = false
  }
  check(
    'a forced mid-chapter break is saved and replays with one additional page',
    replayed && forced.breaks.includes('forced') && forced.pages.length === plan.pages.length + 1,
    `baseline=${plan.pages.length}, forced=${forced.pages.length}, breaks=${forced.breaks.join(',')}`,
  )
}
