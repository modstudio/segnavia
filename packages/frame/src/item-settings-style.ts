// Geometry the item-settings element needs to lay out sections and fields.
// Every selector sits inside :where() so a host rule wins. Colors are
// `--segnavia-*` custom properties with plain defaults.

export const ITEM_SETTINGS_CSS = `
:where(:host){display:block;color:var(--segnavia-ink,currentColor);background:var(--segnavia-surface,transparent);font:inherit}
:where([part~="sections"]){display:grid;gap:1.25rem}
:where([part~="section"]){display:grid;gap:.75rem;text-align:start}
:where([part~="section-title"]){margin:0;font-size:.95rem;font-weight:600;unicode-bidi:isolate}
:where([part~="fills"]){display:flex;flex-wrap:wrap;align-items:end;gap:.5rem}
:where([part~="fills"] label){display:grid;gap:.25rem;min-inline-size:12rem;flex:1}
:where([part~="fills"] button){inline-size:auto}
:where([part~="slots"]){display:grid;gap:.75rem}
:where([part~="slot"]){display:grid;gap:.25rem;text-align:start}
:where([part~="slot"] > span){unicode-bidi:isolate}
:where([part~="required"]){margin-inline-start:.25em}
:where([part~="slot-actions"]){display:flex;flex-wrap:wrap;gap:.5rem}
:where([part~="slot-actions"] button){inline-size:auto}
:where([part~="warning"]){margin:0;color:var(--segnavia-item-settings-warning,currentColor);unicode-bidi:isolate}
:where([data-section="slide"] [part~="section-body"]){display:grid;gap:.75rem}
:where([data-section="slide"] p){margin:0;unicode-bidi:isolate}
:where(.print-frame-panel){display:grid;gap:.75rem}
:where(.print-frame-panel header){display:flex;align-items:start;gap:.5rem}
:where(.print-frame-panel h2),:where(.print-frame-panel p){margin:0;unicode-bidi:isolate}
:where(.print-frame-panel input){inline-size:100%}
:where(.print-frame-actions){display:flex;justify-content:space-between;gap:.5rem}
:where(label span){color:var(--segnavia-muted,currentColor);font-size:.85rem}
:where(input),:where(select),:where(button){box-sizing:border-box;font:inherit;color:var(--segnavia-ink,currentColor);background:var(--segnavia-bg,transparent);border:1px solid var(--segnavia-line,currentColor);border-radius:var(--segnavia-radius,0)}
:where(input),:where(select){inline-size:100%;min-block-size:2.25rem;padding-block:.4rem;padding-inline:.6rem}
:where(button){min-block-size:2.25rem;padding-block:.4rem;padding-inline:.75rem}
:where(input[readonly]){opacity:.85}
`
