// Sideways overflow is clipped at the page edge so Chromium does not shrink a
// one-page print to fit. Containment is limited to one-page prints because it
// stops fixed elements repeating across multi-page prints; min-height keeps
// absolutely positioned content of a short body inside the painted area.
export const SINGLE_PAGE_PRINT_CSS = ':where(:root){contain:paint;min-height:100%}'
