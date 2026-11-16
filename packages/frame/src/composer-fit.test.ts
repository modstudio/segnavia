import { expect, test } from 'bun:test'
import { embeddedComposerFitFunctions } from './composer-fit.ts'

const geometry = {
  paperWidth: 400,
  paperHeight: 600,
  parents: [
    { name: 'segnavia:recto', textArea: { width: 320, height: 520 } },
    { name: 'segnavia:verso', textArea: { width: 280, height: 480 } },
  ],
}

function stagedFitAreas(): Array<{ width: number; height: number }> {
  const templateFits = new Function(`${embeddedComposerFitFunctions()};return templateFits`)() as (
    root: ParentNode,
    geometryFor: () => typeof geometry,
    direction: string,
    lang: string,
    selector: string,
    attribute: string,
  ) => unknown
  const template = { getAttribute: (name: string) => (name === 'data-segnavia-template' ? 'practice' : null) }
  const holders = [
    [{ parent: 'segnavia:verso' }],
    [{ when: { face: 'verso' }, parent: 'segnavia:verso' }, { parent: 'segnavia:recto' }],
  ].map((rules) => ({
    getAttribute: (name: string) => (name === 'data-template' ? 'practice' : null),
    closest: () => ({
      getAttribute: (name: string) =>
        name === 'data-segnavia-parent-rules' ? JSON.stringify(rules) : name === 'data-page-geometry' ? 'book' : name === 'dir' ? 'ltr' : null,
    }),
  }))
  const root = {
    querySelectorAll: (selector: string) => (selector === '[data-segnavia-template]' ? [template] : holders),
  }
  const areas: Array<{ width: number; height: number }> = []
  const shared = globalThis as typeof globalThis & { templatePageFits?: (...args: unknown[]) => unknown[] }
  const previous = shared.templatePageFits
  shared.templatePageFits = (...args) => {
    areas.push(args[4] as { width: number; height: number })
    return []
  }
  try {
    templateFits(root as unknown as ParentNode, () => geometry, 'ltr', '', '[data-fit]', 'data-fit')
  } finally {
    shared.templatePageFits = previous
  }
  return areas
}

test('template copyfit stages holders at their parent-rule areas', () => {
  expect(stagedFitAreas()).toEqual([
    { width: 280, height: 480 },
    { width: 280, height: 480 },
  ])
})
