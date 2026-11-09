import { boardPathElement } from './board-event-path.ts'
import { type LabelDoubleClickTarget, labelDoubleClickTarget } from './board-label-editing.ts'

export class BoardLabelDoubleClick {
  private captured: LabelDoubleClickTarget | undefined

  capture(event: PointerEvent) {
    this.captured = this.target(event)
  }

  resolve(event: MouseEvent): LabelDoubleClickTarget | undefined {
    const target = this.target(event, this.captured)
    this.captured = undefined
    return target
  }

  private target(event: Event, captured?: LabelDoubleClickTarget) {
    return labelDoubleClickTarget(
      boardPathElement(event, 'labelResizeHandle')?.dataset.labelResizeHandle,
      boardPathElement(event, 'boardLabel')?.dataset.boardLabel,
      captured,
    )
  }
}
