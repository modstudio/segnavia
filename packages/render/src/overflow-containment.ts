const CSS = ':where(:root){contain:paint;min-height:100%}'

// Sideways overflow is clipped at the page edge so Chromium does not shrink a
// fixed-size print to fit. Containment is limited to fixed-size prints because
// it stops fixed elements repeating across multi-page prints, and applying it
// before measuring a growing page drops absolute content from its height.
export function containFixedPageOverflow(css: string): string {
  return `${CSS}${css}`
}
