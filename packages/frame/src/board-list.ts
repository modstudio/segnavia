import { type BoardItem, type BoardListingGroup, boardListing, boardListingIsEmpty, foldForSearch, resolveDirection } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import type { SegnaviaBoard } from './board.ts'
import { type BoardListLabels, boardListLabels } from './board-list-labels.ts'
import { BoardSearchPolicy } from './board-search.ts'

export type BoardItemSearch = (query: string, signal: AbortSignal) => Promise<string[]>

export class SegnaviaBoardList extends HTMLElement {
  static observedAttributes = ['for']

  private propertyTarget: SegnaviaBoard | null | undefined
  private activeTarget: SegnaviaBoard | null = null
  private searcher: BoardItemSearch | undefined
  private labelOverrides: Partial<BoardListLabels> = {}
  private contentMatches = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly searchPolicy = new BoardSearchPolicy()
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly input = document.createElement('input')
  private readonly groups = document.createElement('div')

  constructor() {
    super()
    this.input.type = 'search'
    this.input.dir = 'auto'
    this.input.part.add('search')
    this.groups.part.add('groups')
    this.root.append(this.input, this.groups)
  }

  get target(): SegnaviaBoard | null {
    return this.propertyTarget === undefined ? this.attributeTarget() : this.propertyTarget
  }

  set target(value: SegnaviaBoard | null) {
    this.propertyTarget = value
    this.bindTarget()
  }

  get searchItems(): BoardItemSearch | undefined {
    return this.searcher
  }

  set searchItems(value: BoardItemSearch | undefined) {
    this.searcher = value
    this.scheduleSearch()
  }

  get labels(): Partial<BoardListLabels> {
    return this.labelOverrides
  }

  set labels(value: Partial<BoardListLabels>) {
    this.labelOverrides = value
    this.render()
  }

  connectedCallback() {
    ensureBaseStyle(this.input)
    this.input.addEventListener('input', this.onInput)
    this.groups.addEventListener('click', this.onClick)
    this.bindTarget()
  }

  disconnectedCallback() {
    this.input.removeEventListener('input', this.onInput)
    this.groups.removeEventListener('click', this.onClick)
    this.listen(null)
    this.cancelSearch()
  }

  attributeChangedCallback() {
    if (this.propertyTarget === undefined) this.bindTarget()
  }

  private attributeTarget(): SegnaviaBoard | null {
    const id = this.getAttribute('for')
    const candidate = id ? (this.getRootNode() as Document | ShadowRoot).querySelector(`#${CSS.escape(id)}`) : null
    return candidate?.localName === 'segnavia-board' ? (candidate as SegnaviaBoard) : null
  }

  private bindTarget() {
    if (!this.isConnected) return
    const target = this.target
    if (target === this.activeTarget) return
    this.listen(target)
    this.render()
  }

  private listen(target: SegnaviaBoard | null) {
    this.activeTarget?.removeEventListener('segnavia-board-change', this.onBoardUpdate)
    this.activeTarget?.removeEventListener('segnavia-board-names', this.onBoardUpdate)
    this.activeTarget = target
    target?.addEventListener('segnavia-board-change', this.onBoardUpdate)
    target?.addEventListener('segnavia-board-names', this.onBoardUpdate)
  }

  private onBoardUpdate = () => this.render()

  private onInput = () => {
    this.contentMatches.clear()
    this.render()
    this.scheduleSearch()
  }

  private scheduleSearch() {
    this.cancelSearch()
    const query = this.input.value
    if (!this.searcher || !foldForSearch(query)) return
    this.timer = setTimeout(() => this.runSearch(query), 250)
  }

  private cancelSearch() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.searchPolicy.clear()
    this.removeAttribute('data-searching')
  }

  private async runSearch(query: string) {
    const search = this.searcher
    if (!search) return
    const request = this.searchPolicy.begin()
    this.setAttribute('data-searching', '')
    try {
      const ids = await search(query, request.signal)
      if (!this.searchPolicy.accepts(request.version)) return
      const known = new Set(this.activeTarget?.board?.items.map((item) => item.id) ?? [])
      this.contentMatches = new Set(ids.filter((id) => known.has(id)))
      this.render()
    } catch (error) {
      if (!request.signal.aborted && this.searchPolicy.accepts(request.version)) {
        this.dispatchEvent(new CustomEvent('segnavia-board-search-error', { detail: { query, error }, bubbles: true, composed: true }))
      }
    } finally {
      if (this.searchPolicy.accepts(request.version)) this.removeAttribute('data-searching')
    }
  }

  private render() {
    const labels = boardListLabels(this.labelOverrides)
    this.input.setAttribute('aria-label', labels.search)
    this.input.placeholder = labels.searchPlaceholder
    const target = this.activeTarget
    const board = target?.board
    this.dir = board?.direction ?? ''
    const focused = this.root.activeElement instanceof HTMLElement ? this.root.activeElement.dataset.boardItem : undefined
    if (!board || !target) {
      this.groups.replaceChildren()
      return
    }
    const listing = boardListing(board, (item) => target.itemName(item.id), this.input.value, this.contentMatches)
    this.groups.replaceChildren(
      ...(boardListingIsEmpty(this.input.value, listing) ? [this.empty(labels)] : listing.map((group) => this.group(group, target, labels))),
    )
    if (focused) this.groups.querySelector<HTMLElement>(`[data-board-item="${CSS.escape(focused)}"]`)?.focus()
  }

  private group(group: BoardListingGroup, target: SegnaviaBoard, labels: BoardListLabels): HTMLElement {
    const section = document.createElement('section')
    section.part.add('group')
    if (group.kind === 'loose') section.part.add('loose')
    else {
      const heading = document.createElement('button')
      heading.type = 'button'
      heading.part.add('group-title')
      heading.dataset.boardSection = group.section.id
      heading.textContent = group.section.title
      heading.dir = resolveDirection(undefined, undefined, group.section.title)
      section.append(heading)
    }
    const list = document.createElement('ul')
    for (const item of group.items) list.append(this.item(item, target, labels))
    section.append(list)
    return section
  }

  private item(item: BoardItem, target: SegnaviaBoard, labels: BoardListLabels): HTMLLIElement {
    const entry = document.createElement('li')
    const button = document.createElement('button')
    const name = target.itemName(item.id)
    const text = name || labels.untitled(item.kind)
    button.type = 'button'
    button.part.add('item')
    button.dataset.boardItem = item.id
    button.textContent = text
    button.dir = resolveDirection(undefined, undefined, text)
    entry.append(button)
    return entry
  }

  private empty(labels: BoardListLabels): HTMLParagraphElement {
    const empty = document.createElement('p')
    empty.part.add('empty')
    empty.textContent = labels.noMatches
    empty.dir = resolveDirection(undefined, undefined, labels.noMatches)
    return empty
  }

  private onClick = (event: MouseEvent) => {
    const button = event.composedPath().find((node): node is HTMLButtonElement => node instanceof HTMLButtonElement)
    const target = this.activeTarget
    if (!button || !target) return
    const item = target.board?.items.find((entry) => entry.id === button.dataset.boardItem)
    const section = target.board?.sections.find((entry) => entry.id === button.dataset.boardSection)
    if (item) {
      target.reveal(item.id)
      this.dispatchEvent(new CustomEvent('segnavia-board-select', { detail: { item }, bubbles: true, composed: true }))
    } else if (section) {
      target.reveal(section.id)
      this.dispatchEvent(new CustomEvent('segnavia-board-select', { detail: { section }, bubbles: true, composed: true }))
    }
  }
}

export type { BoardListLabels } from './board-list-labels.ts'
