import { type Board, type BoardItemFact, type BoardView, boardShapes, type ComputedBoardShapes, labelShape, resolveDirection } from '@segnavia/format'
import { sizeMeasuredLabels } from './board-label-sizing.ts'
import { placeBoardNode } from './board-placement.ts'

export class BoardDecorations {
  private readonly sectionNodes = new Map<string, HTMLElement>()
  private readonly labelNodes = new Map<string, HTMLElement>()
  private measuringNode: HTMLElement | undefined
  private dropTargetId: string | undefined

  constructor(
    private readonly surface: HTMLElement,
    private readonly mounted: (node: HTMLElement, id: string) => void,
  ) {}

  get nodes(): ReadonlyMap<string, HTMLElement> {
    return new Map([...this.sectionNodes, ...this.labelNodes])
  }

  focusNode(id: string): HTMLElement | undefined {
    const section = this.sectionNodes.get(id)?.querySelector('[data-board-section-title]')
    return section instanceof HTMLElement ? section : this.labelNodes.get(id)
  }

  markSelected(id: string, selected: boolean) {
    const title = this.sectionNodes.get(id)?.querySelector<HTMLElement>('[data-board-section-title]')
    title?.toggleAttribute('data-selected', selected)
    if (selected) title?.part.add('selected')
    else title?.part.remove('selected')
  }

  labelTextNode(id: string): HTMLElement | undefined {
    const text = this.labelNodes.get(id)?.querySelector('[data-board-label-text]')
    return text instanceof HTMLElement ? text : undefined
  }

  render(board: Board, view: BoardView) {
    const sectionIds = new Set(board.sections.map((section) => section.id))
    const labelIds = new Set(board.labels.map((label) => label.id))
    this.removeMissing(this.sectionNodes, sectionIds)
    this.removeMissing(this.labelNodes, labelIds)
    for (const section of board.sections) {
      const node = this.sectionNodes.get(section.id) ?? this.mountSection(section.id)
      this.markDropTarget(node, section.id === this.dropTargetId)
      placeBoardNode(node, view, section.rectangle)
      const title = node.firstElementChild as HTMLElement
      title.textContent = section.title
      title.dir = resolveDirection(undefined, undefined, section.title)
      title.setAttribute('aria-label', section.title)
    }
    for (const label of board.labels) {
      const node = this.labelNodes.get(label.id) ?? this.mountLabel(label.id)
      // The positioned box keeps the surface's physical direction; only its text takes the label's own direction.
      const text = this.labelTextNode(label.id) as HTMLElement
      text.textContent = label.text
      text.dir = resolveDirection(undefined, undefined, label.text)
      text.style.display = label.width === undefined ? '' : 'block'
      text.style.whiteSpace = label.width === undefined ? 'pre' : 'pre-wrap'
      text.style.inlineSize = label.width === undefined ? '' : `${label.width * view.zoom}px`
      placeBoardNode(node, view, label)
      node.style.fontSize = `${16 * view.zoom}px`
      node.setAttribute('aria-label', label.text)
    }
  }

  clear() {
    for (const node of this.sectionNodes.values()) node.remove()
    for (const node of this.labelNodes.values()) node.remove()
    this.sectionNodes.clear()
    this.labelNodes.clear()
  }

  disconnect() {
    this.clear()
    this.measuringNode?.remove()
    this.measuringNode = undefined
  }

  measureLabel(text: string, direction: Board['direction'], authoredWidth: number | undefined, viewZoom: number) {
    const mounted = [...this.labelNodes.values()].find((entry) => {
      const content = entry.querySelector<HTMLElement>('[data-board-label-text]')
      return content?.textContent === text && content.dir === direction
    })
    const node = mounted ?? this.measureNode()
    const content = node.querySelector<HTMLElement>('[data-board-label-text]') as HTMLElement
    const previousText = content.textContent
    const previousDirection = content.dir
    const previous = { display: content.style.display, whiteSpace: content.style.whiteSpace, inlineSize: content.style.inlineSize }
    const previousNodeInlineSize = node.style.inlineSize
    const previousFontSize = node.style.fontSize
    content.textContent = text
    content.dir = direction
    content.style.display = authoredWidth === undefined ? '' : 'block'
    content.style.whiteSpace = authoredWidth === undefined ? 'pre' : 'pre-wrap'
    content.style.inlineSize = authoredWidth === undefined ? '' : `${authoredWidth * viewZoom}px`
    node.style.inlineSize = authoredWidth === undefined ? '' : `${authoredWidth * viewZoom}px`
    node.style.fontSize = `${16 * viewZoom}px`
    const rectangle = node.getBoundingClientRect()
    content.textContent = previousText
    content.dir = previousDirection
    Object.assign(content.style, previous)
    node.style.inlineSize = previousNodeInlineSize
    node.style.fontSize = previousFontSize
    return rectangle.width > 0 && rectangle.height > 0 ? { width: rectangle.width / viewZoom, height: rectangle.height / viewZoom } : undefined
  }

  labelShape(label: Board['labels'][number], zoom: number) {
    return labelShape(label, (text, direction, width) => this.measureLabel(text, direction, width, zoom)).shape
  }

  measureMissingLabels(labels: Board['labels'], zoom: number): Record<string, { width: number; height: number }> {
    const sized = sizeMeasuredLabels(labels, (label) => labelShape(label, (text, direction, width) => this.measureLabel(text, direction, width, zoom)))
    return Object.fromEntries(sized.flatMap((label, index) => (label === labels[index] || !label.size ? [] : [[label.id, label.size]])))
  }

  shapes(board: Board, facts: Readonly<Record<string, BoardItemFact>>, zoom: number): ComputedBoardShapes {
    return boardShapes(board, facts, { measureLabel: (text, direction, width) => this.measureLabel(text, direction, width, zoom) })
  }

  setDropTarget(id?: string) {
    this.dropTargetId = id
    for (const [sectionId, node] of this.sectionNodes) this.markDropTarget(node, sectionId === id)
  }

  private removeMissing(nodes: Map<string, HTMLElement>, present: Set<string>) {
    for (const [id, node] of nodes) {
      if (present.has(id)) continue
      node.remove()
      nodes.delete(id)
    }
  }

  private mountSection(id: string): HTMLElement {
    const node = document.createElement('div')
    node.dataset.decoration = ''
    node.part.add('section')
    const title = document.createElement('div')
    title.part.add('section-title')
    title.dataset.boardSectionTitle = id
    title.tabIndex = 0
    title.setAttribute('role', 'button')
    node.append(title)
    this.sectionNodes.set(id, node)
    this.mounted(node, id)
    this.insert(node)
    return node
  }

  private markDropTarget(node: HTMLElement, target: boolean) {
    node.toggleAttribute('data-drop-target', target)
    if (target) node.part.add('drop-target')
    else node.part.remove('drop-target')
  }

  private mountLabel(id: string): HTMLElement {
    const node = document.createElement('div')
    node.dataset.decoration = ''
    node.dataset.boardLabel = id
    node.part.add('label')
    node.tabIndex = 0
    node.setAttribute('role', 'button')
    const text = document.createElement('span')
    text.dataset.boardLabelText = id
    node.append(text)
    this.labelNodes.set(id, node)
    this.mounted(node, id)
    this.insert(node)
    return node
  }

  private measureNode(): HTMLElement {
    if (this.measuringNode) return this.measuringNode
    const node = document.createElement('div')
    node.dataset.decoration = ''
    node.dataset.boardLabelMeasure = ''
    node.part.add('label')
    node.style.insetInlineStart = '-100000px'
    node.style.insetBlockStart = '0'
    node.style.visibility = 'hidden'
    node.style.pointerEvents = 'none'
    const text = document.createElement('span')
    text.dataset.boardLabelText = ''
    node.append(text)
    this.measuringNode = node
    this.insert(node)
    return node
  }

  private insert(node: HTMLElement) {
    this.surface.insertBefore(node, this.surface.querySelector('[data-board-item]'))
  }
}
