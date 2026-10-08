// The styled components' look. Each value reads a public custom property
// first, so a host sets `--segnavia-accent` (or any other) on any ancestor and
// every component follows. Light and dark come from `light-dark()`, which
// follows the `color-scheme` in effect: a host's own theme switch reaches the
// components with no wiring.
//
//   --segnavia-bg  --segnavia-surface  --segnavia-ink  --segnavia-muted
//   --segnavia-line  --segnavia-accent  --segnavia-accent-ink
//   --segnavia-radius  --segnavia-font  --segnavia-caption-size
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
  font-family:var(--_font);color:var(--_ink);
}
:host([theme="light"]){color-scheme:light}
:host([theme="dark"]){color-scheme:dark}
:host([theme="auto"]){color-scheme:light dark}
:host([hidden]),:host([data-empty]){display:none}
`

export const BUTTON_CSS = `
:host{display:inline-flex}
button{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;inline-size:36px;block-size:36px;border-radius:10px;color:var(--_ink);cursor:pointer}
button:hover{background:var(--_line)}
button:focus-visible{outline:2px solid var(--_accent);outline-offset:1px}
button[disabled]{opacity:.35;cursor:default;background:none}
svg{inline-size:20px;block-size:20px}
[dir="rtl"] .mirror{transform:scaleX(-1)}
`

const icon = (body: string, mirror = false) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${mirror ? ' class="mirror"' : ''}>${body}</svg>`

export const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  previous: icon('<path d="M15 18l-6-6 6-6"/>', true),
  next: icon('<path d="M9 6l6 6-6 6"/>', true),
  notes: icon('<path d="M5 6h14M5 11h14M5 16h9"/>'),
  enterFullscreen: icon('<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>'),
  exitFullscreen: icon('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
}
