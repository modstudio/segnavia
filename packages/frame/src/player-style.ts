// The player's layout. Its look comes from the styled components inside it,
// so theming the player and theming the components are the same act: set
// `--segnavia-*` properties, or `theme`, on the player or any ancestor.

import { buttonChrome, TOKENS_CSS } from './controls-style.ts'

export const PLAYER_CSS = `${TOKENS_CSS}
:host{display:block;position:relative;container-type:inline-size;background:var(--_bg);border-radius:var(--_radius);overflow:hidden;min-height:240px;
  font-size:15px;line-height:1.45}
:host(:not([theme])){color-scheme:light dark}
:host(:fullscreen){border-radius:0}
/* Keep this specific overlay: BASE_CSS's zero-specificity rule loses to the player's relative positioning. */
:host([data-presenting]){position:fixed;inset:0;z-index:2147483647;inline-size:auto;block-size:auto;max-inline-size:none;max-block-size:none;
  border-radius:0;background:var(--segnavia-backdrop,#111);overflow:hidden;color-scheme:dark}
.fit-reserve{position:absolute;visibility:hidden;pointer-events:none;block-size:var(--segnavia-fit-reserve,0px)}
.player{display:grid;grid-template-columns:minmax(0,1fr);grid-template-areas:"body" "caption" "bar" "below";grid-template-rows:minmax(0,1fr) auto auto auto;min-height:inherit}
:host([rail]) .player{grid-template-columns:calc(var(--segnavia-rail-size,160px) + 24px) minmax(0,1fr);grid-template-areas:"rail body" "rail caption" "bar bar" "below below"}
.body{grid-area:body;min-height:0;display:flex}
.screen{flex:1;min-width:0;container-type:inline-size;display:block;padding-block-end:8px}
:host(:not([data-presenting]):not([fit="width"]):not([fit="height"])) .screen{display:grid;place-items:center}
segnavia-stage{width:100%;height:auto;border-radius:calc(var(--_radius) - 4px);
  box-shadow:0 1px 2px rgb(0 0 0 / .18),0 10px 30px rgb(0 0 0 / .22);--segnavia-canvas:#fff}
:host([fit="height"]) .player,:host([data-presenting]) .player{height:100%}
:host([fit="height"]) .screen,:host([data-presenting]) .screen{container-type:size;display:grid;place-items:center;padding:16px 16px 8px}
:host([fit="height"]) segnavia-stage,:host([data-presenting]) segnavia-stage{width:min(100cqw,100cqh * var(--ratio,1.7778))}
segnavia-stage:focus-visible{outline:2px solid var(--_accent);outline-offset:3px}
segnavia-notes{inline-size:clamp(200px,28%,340px);border-inline-start:1px solid var(--_line);padding:16px 18px;overflow:auto;background:var(--_surface)}
.notes-closed segnavia-notes{display:none}
segnavia-caption{grid-area:caption;padding:6px 24px 10px;min-block-size:calc(var(--segnavia-caption-size,20px) * 1.5 * 2);overflow:hidden}
segnavia-caption[data-empty]{display:block}
.silent segnavia-caption{display:none}
.bar{grid-area:bar;display:flex;flex-direction:column;gap:4px;padding:8px 12px 12px}
segnavia-rail{grid-area:rail;min-block-size:0;display:none;border-inline-end:1px solid var(--_line);background:var(--_surface)}
:host([rail]) segnavia-rail{display:block}
.below{grid-area:below}
segnavia-track{inline-size:100%}
.control-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;min-block-size:var(--_play-size)}
.start,.center,.end{display:flex;align-items:center;gap:4px}.center{grid-column:2}.end{justify-self:end;min-inline-size:0}.start{justify-self:start}
.time-separator{color:var(--_muted)}
.time-separator[hidden]{display:none}
segnavia-counter{padding-inline:6px}
${buttonChrome('.notes-toggle', 'slot[name="actions"]::slotted(button&)')}
.notes-toggle svg{inline-size:20px;block-size:20px}
.notes-toggle slot{display:inline-grid;place-items:center;inline-size:20px;block-size:20px;pointer-events:none}
.notes-toggle slot::slotted(*){inline-size:20px;block-size:20px}
slot[slot^="icon-"]{pointer-events:none}
slot[slot^="icon-"]::slotted(*){inline-size:20px;block-size:20px;pointer-events:none}
.notes-toggle[hidden]{display:none}
::slotted([slot="actions"]){flex:none}
:host([data-presenting]) .below,:host([data-presenting]) segnavia-rail{display:none}
:host([data-presenting]) .player{grid-template-columns:minmax(0,1fr);grid-template-areas:"body" "caption" "bar" "below"}
@container (max-width:560px){segnavia-counter,.time-separator,segnavia-notes{display:none}
  .player,:host([rail]) .player{grid-template-columns:minmax(0,1fr);grid-template-areas:"body" "caption" "bar" "rail" "below";grid-template-rows:auto auto auto auto auto}
  .body{min-block-size:auto}.screen,:host([fit="height"]) .screen,:host([data-presenting]) .screen{container-type:normal;display:block;padding:0 0 4px}segnavia-stage,:host([fit="height"]) segnavia-stage,:host([data-presenting]) segnavia-stage{width:100%}segnavia-caption{min-block-size:0}
  segnavia-rail{border-inline-end:0;border-block-start:1px solid var(--_line)}}
@container (max-width:380px){.notes-toggle,segnavia-fullscreen{display:none}.end{--segnavia-control-size:28px;gap:0}}
`
