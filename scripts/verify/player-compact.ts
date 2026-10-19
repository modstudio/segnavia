import { compactBarHeight } from '../../packages/frame/src/player-layout.ts'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const PLAYER = 'segnavia-player'
const COMPACT_BAR_HEIGHT_SRC = compactBarHeight.toString()

interface Box {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

interface ActionBarGeometry {
  playerWidth: number
  overlaps: string[]
  offscreen: string[]
  playCentered: boolean
  actionsUnderTransport: boolean
  actionsOneRowBelowRail: boolean
  railTop: number
  transportBottom: number
  actionsTop: number | null
  actionsBottom: number | null
  railBottom: number
}

const NARRATION = {
  text: 'Hello there friend',
  words: [
    { text: 'Hello', startMs: 0, endMs: 300 },
    { text: 'there', startMs: 300, endMs: 600 },
    { text: 'friend', startMs: 600, endMs: 900 },
  ],
  durationMs: 900,
  audio: null,
}

async function mountRailAndActions(h: Harness, count: number, extras?: { dir?: 'rtl'; narration?: boolean; notes?: boolean }) {
  await h.page.locator(PLAYER).evaluate(
    async (player, input) => {
      const host = player as HTMLElement & { controller: { load(deck: unknown): Promise<void> } }
      host.setAttribute('rail', '')
      for (const button of [...host.querySelectorAll('[slot="actions"]')]) button.remove()
      for (const label of input.labels) {
        const action = document.createElement('button')
        action.slot = 'actions'
        action.setAttribute('aria-label', label)
        action.textContent = label
        host.append(action)
      }
      await host.controller.load({
        title: 'Compact actions',
        dir: input.dir,
        size: { width: 1280, height: 720 },
        slides: [
          {
            id: 'a',
            content: { kind: 'html', html: '<p>A</p>' },
            notes: input.notes ? 'Notes' : undefined,
            narration: input.narration ? input.narrationSource : undefined,
          },
          { id: 'b', content: { kind: 'html', html: '<p>B</p>' } },
          { id: 'c', content: { kind: 'html', html: '<p>C</p>' } },
        ],
      })
    },
    {
      labels: ['Settings', 'Export', 'Share'].slice(0, count),
      dir: extras?.dir,
      notes: extras?.notes ?? true,
      narration: extras?.narration ?? true,
      narrationSource: NARRATION,
    },
  )
  await h.waitFor(PLAYER, (data) => data.slide === '1')
}

function visibleBox(box: Box | null): box is Box {
  return Boolean(box && box.width > 0 && box.height > 0)
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

async function actionBarGeometry(h: Harness): Promise<ActionBarGeometry> {
  const raw = await h.page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const rect = (element: Element | null | undefined) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height }
    }
    const control = (selector: string) => rect(root.querySelector(selector)?.shadowRoot?.querySelector('button'))
    return {
      play: control('segnavia-play'),
      previous: control('segnavia-step[to="previous"]'),
      next: control('segnavia-step[to="next"]'),
      present: control('segnavia-fullscreen'),
      actionBoxes: [...player.querySelectorAll('[slot="actions"]')].map((action) => rect(action)),
      playerBox: rect(player),
      rail: rect(root.querySelector('segnavia-rail')),
      transport: rect(root.querySelector('.center')),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })
  const named = [
    { name: 'previous', box: raw.previous },
    { name: 'play', box: raw.play },
    { name: 'next', box: raw.next },
    { name: 'present', box: raw.present },
    ...raw.actionBoxes.map((box, index) => ({ name: `action-${index + 1}`, box })),
  ].filter((entry): entry is { name: string; box: Box } => visibleBox(entry.box))
  const overlaps: string[] = []
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i]
      const b = named[j]
      if (a && b && boxesOverlap(a.box, b.box)) overlaps.push(`${a.name}∩${b.name}`)
    }
  }
  const actions = named.filter(({ name }) => name.startsWith('action-'))
  const first = actions[0]?.box
  const play = raw.play
  const playerBox = raw.playerBox
  const rail = raw.rail
  return {
    playerWidth: playerBox?.width ?? 0,
    overlaps,
    offscreen: named
      .filter(({ box }) => box.left < -0.5 || box.top < -0.5 || box.right > raw.viewport.width + 0.5 || box.bottom > raw.viewport.height + 0.5)
      .map(({ name }) => name),
    playCentered: play && playerBox ? Math.abs(play.left + play.width / 2 - (playerBox.left + playerBox.width / 2)) < 1 : false,
    actionsUnderTransport: Boolean(play && actions.length > 0 && actions.every(({ box }) => box.top >= play.bottom - 0.5)),
    actionsOneRowBelowRail: Boolean(
      rail &&
        first &&
        actions.length > 0 &&
        actions.every(({ box }) => box.top >= rail.bottom - 0.5) &&
        actions.every(({ box }) => Math.abs(box.top - first.top) < 0.5 && Math.abs(box.width - first.width) < 1),
    ),
    railTop: rail?.top ?? 0,
    transportBottom: raw.transport?.bottom ?? 0,
    actionsTop: first?.top ?? null,
    actionsBottom: first ? Math.max(...actions.map(({ box }) => box.bottom)) : null,
    railBottom: rail?.bottom ?? 0,
  }
}

function focusKindSrc() {
  return `function focusKind() {
    let node = document.activeElement
    while (node && node.shadowRoot && node.shadowRoot.activeElement) node = node.shadowRoot.activeElement
    if (!node) return 'none'
    if (node.closest && node.closest('[slot="actions"]')) return 'action'
    if (node.classList && node.classList.contains('notes-toggle')) return 'notes'
    const root = node.getRootNode()
    const host = root instanceof ShadowRoot ? root.host : node
    const tag = host.tagName ? host.tagName.toLowerCase() : ''
    if (tag === 'segnavia-step' && host.getAttribute('to') === 'next') return 'next'
    if (tag === 'segnavia-step') return 'previous'
    if (tag === 'segnavia-play') return 'play'
    if (tag === 'segnavia-mute') return 'mute'
    if (tag === 'segnavia-captions') return 'captions'
    if (tag === 'segnavia-fullscreen') return 'present'
    if (tag === 'segnavia-rail') return 'rail'
    if (tag === 'segnavia-track') return 'track'
    return tag || node.tagName.toLowerCase()
  }`
}

async function readFocusKind(h: Harness): Promise<string> {
  return h.page.evaluate((src) => {
    const focusKind = new Function(`return (${src})`)()
    return focusKind() as string
  }, focusKindSrc())
}

async function tabKindsFromNext(h: Harness): Promise<string[]> {
  await h.page.waitForFunction(() => {
    const actions = document.querySelector('segnavia-player')?.shadowRoot?.querySelector('.actions') as HTMLElement | null
    return Boolean(actions && actions.previousElementSibling?.tagName === 'SEGNAVIA-RAIL')
  })
  await h.page.locator(PLAYER).evaluate((player) => {
    const next = player.shadowRoot?.querySelector('segnavia-step[to="next"]')?.shadowRoot?.querySelector('button') as HTMLButtonElement | null
    next?.focus()
  })
  const kinds: string[] = []
  for (let step = 0; step < 16; step++) {
    const kind = await readFocusKind(h)
    kinds.push(kind)
    if (step > 0 && (kind === 'next' || kind === 'none' || kind === 'body' || kind === 'html')) break
    await h.page.keyboard.press('Tab')
  }
  return kinds
}

function tabGroupsAfterNext(kinds: string[]): string[] {
  const start = kinds.indexOf('next')
  const rest = start < 0 ? kinds : kinds.slice(start + 1)
  const group = (kind: string) => {
    if (kind === 'mute' || kind === 'captions' || kind === 'notes' || kind === 'present') return 'end'
    return kind
  }
  const grouped: string[] = []
  for (const kind of rest.map(group)) {
    if (kind === 'none' || kind === 'body' || kind === 'html' || kind === 'next') break
    if (grouped.at(-1) !== kind) grouped.push(kind)
  }
  return grouped
}

export async function verifyCompactPlayerActions(h: Harness) {
  const { page, check } = h
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountRailAndActions(h, 3)
  await page.waitForTimeout(200)
  let bars = await actionBarGeometry(h)
  check('393px player with a rail is 393px wide', Math.abs(bars.playerWidth - 393) < 1, JSON.stringify(bars))
  check('393px bar with three actions keeps Play, Step, Next, Present and actions from overlapping', bars.overlaps.length === 0, JSON.stringify(bars.overlaps))
  check('393px bar with three actions keeps every control inside the viewport', bars.offscreen.length === 0, JSON.stringify(bars.offscreen))
  check('393px player puts the three actions side by side, equal width, on one row below the rail', bars.actionsOneRowBelowRail, JSON.stringify(bars))
  check(
    '393px rail sits below the transport row and above the actions',
    bars.railTop >= bars.transportBottom - 0.5 && bars.actionsTop !== null && bars.railBottom <= (bars.actionsTop ?? 0) + 0.5,
    JSON.stringify(bars),
  )
  const tabs = await tabKindsFromNext(h)
  const groups = tabGroupsAfterNext(tabs)
  const endAt = groups.indexOf('end')
  const railAt = groups.indexOf('rail')
  const actionAt = groups.indexOf('action')
  const afterRail = await page.locator(PLAYER).evaluate((player) => {
    const actions = player.shadowRoot?.querySelector('.actions')
    return actions?.previousElementSibling?.tagName ?? ''
  })
  check(
    '393px Tab from Next visits mute/present, then rail, before any host action',
    endAt === 0 && railAt === 1 && (actionAt === -1 || actionAt > railAt),
    JSON.stringify({ tabs, groups }),
  )
  check('393px compact shadow puts .actions after the rail', afterRail === 'SEGNAVIA-RAIL', afterRail)
  await h.evidence('player-actions-393.png')

  await mountRailAndActions(h, 2)
  await page.waitForTimeout(200)
  await h.evidence('player-actions-393-two.png')

  await mountRailAndActions(h, 0)
  await page.waitForTimeout(200)
  const empty = await page.locator(PLAYER).evaluate((player, src) => {
    const compactBarHeight = new Function(`return (${src})`)()
    const root = player.shadowRoot as ShadowRoot
    const height = (selector: string) => root.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0
    const actions = root.querySelector('.actions') as HTMLElement
    const rail = root.querySelector('segnavia-rail') as HTMLElement
    const playerBox = player.getBoundingClientRect()
    const parts = {
      track: height('segnavia-track'),
      start: height('.start'),
      center: height('.center'),
      endControls: height('.end-controls'),
      actions: height('.actions'),
    }
    return {
      actionsHeight: actions.offsetHeight,
      actionsBoxHeight: actions.getBoundingClientRect().height,
      belowRail: playerBox.bottom - rail.getBoundingClientRect().bottom,
      reserved: compactBarHeight(parts),
      withoutActions: compactBarHeight({ ...parts, actions: 0 }),
    }
  }, COMPACT_BAR_HEIGHT_SRC)
  check(
    '393px empty actions row takes no height and contain reserves nothing for it',
    empty.actionsHeight === 0 && empty.actionsBoxHeight === 0 && empty.belowRail <= 1 && empty.reserved === empty.withoutActions,
    JSON.stringify(empty),
  )
  await h.evidence('player-actions-393-empty.png')

  await mountRailAndActions(h, 2, { dir: 'rtl' })
  await page.waitForTimeout(200)
  const rtl = await page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const board = root.querySelector('.player') as HTMLElement
    const start = root.querySelector('.start') as HTMLElement
    const playerBox = board.getBoundingClientRect()
    const startBox = start.getBoundingClientRect()
    const pad = Number.parseFloat(getComputedStyle(start).paddingInlineStart)
    const contentStart = board.dir === 'rtl' ? startBox.right - pad : startBox.left + pad
    const playerStart = board.dir === 'rtl' ? playerBox.right : playerBox.left
    return { dir: board.dir, pad, inset: Math.abs(contentStart - playerStart) }
  })
  check('393px RTL start group is inset 12px from inline-start', rtl.dir === 'rtl' && rtl.pad === 12 && Math.abs(rtl.inset - 12) < 1, JSON.stringify(rtl))
  await h.evidence('player-actions-393-rtl.png')

  await page.goto(h.url('layout-overlay.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountRailAndActions(h, 3)
  await page.waitForTimeout(200)
  bars = await actionBarGeometry(h)
  check(
    '393px overlay bar with three actions keeps Play, Step, Next, Present and actions from overlapping',
    bars.overlaps.length === 0,
    JSON.stringify(bars.overlaps),
  )
  check('393px overlay bar with three actions keeps every control inside the viewport', bars.offscreen.length === 0, JSON.stringify(bars.offscreen))
  await h.evidence('player-actions-overlay-393.png')

  await mountRailAndActions(h, 3, { narration: true, notes: false })
  await page.waitForTimeout(200)
  const deadline = Date.now() + BOUNDED_WAIT_MS
  let caption: { wordBottoms: number[]; barTop: number; clear: boolean; wordCount: number } | null = null
  while (Date.now() < deadline) {
    caption = await page.locator(PLAYER).evaluate((player) => {
      const root = player.shadowRoot as ShadowRoot
      const bar = (root.querySelector('.bar') as HTMLElement).getBoundingClientRect()
      const words = [...(root.querySelector('segnavia-caption')?.shadowRoot?.querySelectorAll('span') ?? [])].map((word) => word.getBoundingClientRect().bottom)
      return { wordBottoms: words, barTop: bar.top, clear: words.length > 0 && words.every((bottom) => bottom <= bar.top + 0.5), wordCount: words.length }
    })
    if (caption.clear || caption.wordCount > 0) break
    await page.waitForTimeout(50)
  }
  check('393px overlay caption words end above the bar', Boolean(caption && caption.wordCount > 0 && caption.clear), JSON.stringify(caption))
  await h.evidence('player-overlay-captions-393.png')

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountRailAndActions(h, 3)
  await page.waitForTimeout(200)
  bars = await actionBarGeometry(h)
  check('1280px bar keeps play centered with three slotted actions', bars.playCentered, JSON.stringify(bars))
  check('1280px bar keeps three slotted actions on the transport row', !bars.actionsUnderTransport, JSON.stringify(bars))
  const deskDom = await page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const actions = root.querySelector('.actions') as HTMLElement
    const end = root.querySelector('.end') as HTMLElement
    return { parentIsEnd: actions.parentElement === end, beforeEndControls: actions.nextElementSibling?.classList.contains('end-controls') === true }
  })
  check('1280px desk DOM keeps actions inside .end before .end-controls', deskDom.parentIsEnd && deskDom.beforeEndControls, JSON.stringify(deskDom))
  await h.evidence('player-desk-1280.png')
}
