export function boardPathElement(event: Event, data: keyof DOMStringMap): HTMLElement | undefined {
  return event.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && target.dataset[data] !== undefined)
}
