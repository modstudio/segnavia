import { type Board, type BoardView, boardToScreen, resolveDirection } from '@segnavia/format'

export class BoardDecorations {
  private readonly sectionNodes = new Map<string, HTMLElement>()
  private readonly labelNodes = new Map<string, HTMLElement>()

  constructor(private readonly surface: HTMLElement) {}

  render(board: Board, view: BoardView) {
    const sectionIds = new Set(board.sections.map((section) => section.id))
    const labelIds = new Set(board.labels.map((label) => label.id))
    this.removeMissing(this.sectionNodes, sectionIds)
    this.removeMissing(this.labelNodes, labelIds)
    for (const section of board.sections) {
      const node = this.sectionNodes.get(section.id) ?? this.mountSection(section.id)
      this.place(node, view, section.rectangle.x, section.rectangle.y, section.rectangle.width, section.rectangle.height)
      const title = node.firstElementChild as HTMLElement
      title.textContent = section.title
      title.dir = resolveDirection(undefined, undefined, section.title)
    }
    for (const label of board.labels) {
      const node = this.labelNodes.get(label.id) ?? this.mountLabel(label.id)
      node.textContent = label.text
      node.dir = resolveDirection(undefined, undefined, label.text)
      const point = boardToScreen(view, label)
      node.style.insetInlineStart = `${point.x}px`
      node.style.insetBlockStart = `${point.y}px`
      node.style.fontSize = `${16 * view.zoom}px`
    }
  }

  clear() {
    this.sectionNodes.clear()
    this.labelNodes.clear()
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
    node.append(title)
    this.sectionNodes.set(id, node)
    this.insert(node)
    return node
  }

  private mountLabel(id: string): HTMLElement {
    const node = document.createElement('div')
    node.dataset.decoration = ''
    node.part.add('label')
    this.labelNodes.set(id, node)
    this.insert(node)
    return node
  }

  private insert(node: HTMLElement) {
    this.surface.insertBefore(node, this.surface.querySelector('[data-board-item]'))
  }

  private place(node: HTMLElement, view: BoardView, x: number, y: number, width: number, height: number) {
    const point = boardToScreen(view, { x, y })
    node.style.insetInlineStart = `${point.x}px`
    node.style.insetBlockStart = `${point.y}px`
    node.style.inlineSize = `${width * view.zoom}px`
    node.style.blockSize = `${height * view.zoom}px`
  }
}
