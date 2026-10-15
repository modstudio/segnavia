// The styled components' look. Each value reads a public custom property
// first, so a host sets `--segnavia-accent` (or any other) on any ancestor and
// every component follows. Light and dark come from `light-dark()`, which
// follows the `color-scheme` in effect: a host's own theme switch reaches the
// components with no wiring.
//
//   --segnavia-bg  --segnavia-surface  --segnavia-ink  --segnavia-muted
//   --segnavia-line  --segnavia-accent  --segnavia-accent-ink
//   --segnavia-radius  --segnavia-font  --segnavia-caption-size
//   --segnavia-control-size  --segnavia-play-size
//
// Logical properties throughout, so every component mirrors in right to left.

export const TOKENS_CSS = `
:host{
  --_bg:var(--segnavia-bg,light-dark(#f4f4f2,#0f1013));
  --_surface:var(--segnavia-surface,light-dark(#fff,#17181d));
  --_ink:var(--segnavia-ink,light-dark(#18191d,#f3f3f5));
  --_muted:var(--segnavia-muted,light-dark(#686a73,#9c9da6));
  --_line:var(--segnavia-line,light-dark(#e1e1de,#2b2d35));
  --_accent:var(--segnavia-accent,light-dark(#3a52dd,#8d9dff));
  --_accent-ink:var(--segnavia-accent-ink,light-dark(#fff,#0f1013));
  --_radius:var(--segnavia-radius,12px);
  --_font:var(--segnavia-font,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Hebrew","Noto Sans Arabic",sans-serif);
  --_control-size:var(--segnavia-control-size,36px);
  --_play-size:var(--segnavia-play-size,48px);
  font-family:var(--_font);color:var(--_ink);
}
:host([theme="light"]){color-scheme:light}
:host([theme="dark"]){color-scheme:dark}
:host([theme="auto"]){color-scheme:light dark}
:host([hidden]),:host([data-empty]){display:none}
`

export function buttonChrome(...selectors: string[]): string {
  const select = (state = '') => selectors.map((value) => (value.includes('&') ? value.replace('&', state) : `${value}${state}`)).join(',')
  const selector = select()
  return `${selector}{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;inline-size:var(--_control-size);block-size:var(--_control-size);border-radius:10px;color:var(--_ink);cursor:pointer}
${select(':hover')}{background:var(--_line)}
${select(':focus-visible')}{outline:2px solid var(--_accent);outline-offset:1px}
${select('[disabled]')}{opacity:.35;cursor:default;background:none}`
}

export const BUTTON_CSS = `
:host{display:inline-flex}
${buttonChrome('button')}
svg{inline-size:20px;block-size:20px}
slot{display:inline-grid;place-items:center;inline-size:20px;block-size:20px;pointer-events:none}
slot[hidden]{display:none}
slot::slotted(*){inline-size:20px;block-size:20px}
[dir="rtl"] .mirror{transform:scaleX(-1)}
`

export const READOUT_CSS = ':host{display:inline-block;font-variant-numeric:tabular-nums;color:var(--_muted);font-size:13px;white-space:nowrap}'
