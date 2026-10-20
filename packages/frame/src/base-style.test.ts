import { describe, expect, test } from 'bun:test'
import { BASE_CSS } from './base-style.ts'
import { HEADLESS_ELEMENT_NAMES } from './headless-elements.ts'

// The headless elements promise a host never has to fight their styles: every
// rule they bring has zero specificity, so any rule a host writes wins.
describe('headless base styles', () => {
  test('every selector sits wholly inside :where()', () => {
    const selectors = [...BASE_CSS.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)].map((match) => (match[1] ?? '').trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim()).toMatch(/^:where\(.*\)$/)
    }
  })

  test('every selector excludes an unstyled root element', () => {
    const names = HEADLESS_ELEMENT_NAMES.join('|')
    const selectors = BASE_CSS.match(new RegExp(`:where\\((?:${names})`, 'g')) ?? []
    const exclusions = BASE_CSS.match(new RegExp(`:where\\((?:${names}):not\\(\\[unstyled\\]\\)`, 'g')) ?? []
    expect(selectors.length).toBeGreaterThan(5)
    expect(exclusions).toHaveLength(selectors.length)
  })

  test('appearance arrives only as custom properties with plain defaults', () => {
    for (const color of BASE_CSS.match(/#[0-9a-f]{3,8}\b|rgb\(/gi) ?? []) {
      expect(BASE_CSS).toMatch(new RegExp(`var\\(--segnavia-[a-z-]+,${color.replace('(', '\\(')}`))
    }
  })

  test('the board toolbar supplies inline-row geometry and customizable colors', () => {
    expect(BASE_CSS).toContain(
      '[part~="toolbar"]){display:inline-flex;flex-direction:row;align-items:center;color:var(--segnavia-board-toolbar-color,currentColor)',
    )
    expect(BASE_CSS).toContain(
      'color:var(--segnavia-board-toolbar-button-color,currentColor);background:var(--segnavia-board-toolbar-button-background,transparent)',
    )
    expect(BASE_CSS).toContain('button[hidden]){display:none}')
  })

  test('an incoming canvas stacks above the active canvas without becoming visible', () => {
    expect(BASE_CSS).toContain('.segnavia-stage__canvas[data-active]){opacity:1;pointer-events:auto;z-index:1}')
    expect(BASE_CSS).toContain('.segnavia-stage__canvas[data-incoming]){z-index:2}')
  })

  test('turn motion uses only geometry and opacity with the duration custom property', () => {
    expect(BASE_CSS).toContain('transition-property:opacity,translate')
    expect(BASE_CSS).toContain('.segnavia-stage__canvas[data-transition][data-running]){transition-duration:var(--segnavia-transition-duration)')
    expect(BASE_CSS).toContain('[data-transition="slide"]')
  })

  test('the board exposes geometry for every documented part without a surface scale', () => {
    for (const part of ['surface', 'item', 'cover', 'placeholder', 'label', 'section', 'section-title']) expect(BASE_CSS).toContain(`[part~="${part}"]`)
    expect(BASE_CSS).toContain(':host(segnavia-board:not([unstyled]))')
    expect(BASE_CSS).not.toMatch(/\[part~="surface"\][^{]*\{[^}]*transform:/)
  })

  test('board editing supplies screen-sized marquee and handle geometry', () => {
    expect(BASE_CSS).toContain('[part~="marquee"]){position:absolute;box-sizing:border-box;border:1px solid var(--segnavia-board-marquee-color,#2463eb)')
    expect(BASE_CSS).toContain('inline-size:8px;block-size:8px;translate:-50% -50%')
    expect(BASE_CSS).toContain('var(--segnavia-board-handle-background,#fff)')
    expect(BASE_CSS).toContain('[part~="section"][part~="drop-target"]){outline:2px solid var(--segnavia-board-drop-target-color,#2463eb)')
  })

  test('the board list exposes geometry and custom-property colors for every part', () => {
    for (const part of ['search', 'groups', 'group', 'group-title', 'item', 'empty']) expect(BASE_CSS).toContain(`[part~="${part}"]`)
    expect(BASE_CSS).toContain(':host(segnavia-board-list)')
    expect(BASE_CSS).toContain('var(--segnavia-board-list-background,transparent)')
  })
})
