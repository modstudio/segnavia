import { ELEMENT_PROPERTY_DESCRIPTORS } from '@segnavia/frame/element-properties'
import { MARKDOWN_EDITOR_PROPERTIES } from '../../packages/markdown-editor/src/element-properties.ts'
import type { Harness } from './harness.ts'

type VueFacts = {
  events: Array<{ name: string; detail: unknown }>
  lateReplay: Record<string, boolean>
  weakReplayTags: string[]
  titles: Record<string, unknown>
}

export async function verifyVue(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('vue.html'))
  await page.waitForFunction(() => 'vueFacts' in window)

  for (const order of ['late', 'early']) {
    await page.waitForFunction((id) => document.querySelector(`#${id}-stage iframe`), order)
    await page.waitForFunction((id) => document.querySelector(`#${id}-thumbnail`)?.shadowRoot?.querySelector('iframe'), order)
    const stageText = await page.locator(`#${order}-stage iframe`).contentFrame().locator('h1').textContent()
    const thumbnailText = await page.locator(`#${order}-thumbnail iframe`).contentFrame().locator('h1').textContent()
    check(
      `Vue ${order === 'late' ? 'late .prop' : 'defined-before plain'} object bindings render stage and thumbnail content`,
      stageText === 'Vue rendered slide' && thumbnailText === 'Vue rendered slide',
      JSON.stringify({ stageText, thumbnailText }),
    )
  }

  const facts = await page.evaluate(() => (window as unknown as { vueFacts: VueFacts }).vueFacts)
  const expectedTags = [...ELEMENT_PROPERTY_DESCRIPTORS.map(({ tag }) => tag), MARKDOWN_EDITOR_PROPERTIES.tag]
  const replayed = expectedTags.filter((tag) => facts.lateReplay[tag])
  check(
    'Every descriptor-derived element replays a property set before definition',
    replayed.length === expectedTags.length && Object.keys(facts.lateReplay).length === expectedTags.length,
    JSON.stringify({ replayed, expectedTags, weakerGetterChecks: facts.weakReplayTags }),
  )

  const eventNames = facts.events.map(({ name }) => name)
  const editorState = facts.events.find(({ name }) => name === 'late-editor-state')?.detail as { canUndo?: unknown } | undefined
  check(
    'Vue listeners receive stage, thumbnail, and editor CustomEvents with their details',
    eventNames.includes('late-stage-fit') &&
      eventNames.includes('early-stage-fit') &&
      eventNames.includes('late-thumbnail-error') &&
      eventNames.includes('early-thumbnail-error') &&
      typeof editorState?.canUndo === 'boolean',
    JSON.stringify(facts.events),
  )

  check(
    'Markdown editor title attributes and property follow the upgrade policy',
    JSON.stringify(facts.titles) ===
      JSON.stringify({
        upgrade: { title: 'Title present at upgrade', attribute: null },
        afterAttribute: { title: 'Title set after upgrade', attribute: null },
        afterRemoval: 'Title set after upgrade',
        afterProperty: { title: 'Title set as property', attribute: null },
      }),
    JSON.stringify(facts.titles),
  )
}
