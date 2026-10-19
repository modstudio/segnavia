export abstract class BoardSelectionElement extends HTMLElement {
  abstract get selection(): readonly string[]
  abstract set selection(value: readonly string[])

  get selected(): string | null {
    return this.selection[0] ?? null
  }

  set selected(value: string | null) {
    this.selection = value === null ? [] : [value]
  }
}
