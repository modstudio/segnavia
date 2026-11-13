export const LINE_NUMBER_BASE_CSS = `
:where([data-segnavia-line-numbers]){position:absolute;inset:0;pointer-events:none}
:where([data-segnavia-line-number]){position:absolute;display:block;inline-size:max-content;white-space:nowrap;unicode-bidi:isolate;color:var(--segnavia-line-number-color,inherit);font-size:var(--segnavia-line-number-size,.8em)}
:where([data-segnavia-line-numbers][data-segnavia-area="text"] [data-segnavia-side="left"]){translate:-100% 0}
:where([data-segnavia-line-numbers][data-segnavia-area="text"] [data-segnavia-side="left"][data-segnavia-edge="outer"]){translate:calc(-100% - var(--segnavia-line-number-gap,.75em)) 0}
:where([data-segnavia-line-numbers][data-segnavia-area="text"] [data-segnavia-side="right"]){translate:0 0}
:where([data-segnavia-line-numbers][data-segnavia-area="text"] [data-segnavia-side="right"][data-segnavia-edge="outer"]){translate:var(--segnavia-line-number-gap,.75em) 0}
:where([data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-side="left"]){translate:var(--segnavia-line-number-gap,.75em) 0}
:where([data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-side="right"]){translate:calc(0px - var(--segnavia-line-number-gap,.75em)) 0}
`

export const SIDE_NOTE_BASE_CSS = `
:where([data-side-note]){position:absolute;visibility:hidden;pointer-events:none}
:where([data-segnavia-side-notes]){position:absolute;inset:0;pointer-events:none}
:where([data-segnavia-side-notes] [data-side-note]){box-sizing:border-box;margin-block-start:0;visibility:visible;unicode-bidi:isolate}
`
