// The player's layout. Its look comes from the styled components inside it,
// so theming the player and theming the components are the same act: set
// `--segnavia-*` properties, or `theme`, on the player or any ancestor.

import { buttonChrome, TOKENS_CSS } from './controls-style.ts'
import { COMPACT_PLAYER_WIDTH } from './player-layout.ts'

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
segnavia-stage,segnavia-rail{--_segnavia-shot-backdrop:var(--segnavia-shot-backdrop,#fff)}
:host([fit="height"]) .player,:host([data-presenting]) .player{height:100%}
:host([fit="height"]) .screen,:host([data-presenting]) .screen{container-type:size;display:grid;place-items:center;padding:16px 16px 8px}
:host([fit="height"]) segnavia-stage,:host([data-presenting]) segnavia-stage{width:min(100cqw,100cqh * var(--ratio,1.7778))}
:host([data-layout="responsive"][fit="height"]) segnavia-stage,:host([data-layout="responsive"][data-presenting]) segnavia-stage{width:100%;height:100%}
:host([data-layout="responsive"][fit="height"]) .screen,:host([data-layout="responsive"][data-presenting]) .screen{padding:0}
:host([data-layout="responsive"]:not([fit="width"]):not([fit="height"]):not([data-presenting])) .screen{padding:0}
segnavia-stage:focus-visible{outline:2px solid var(--_accent);outline-offset:3px}
segnavia-notes{inline-size:clamp(200px,28%,340px);border-inline-start:1px solid var(--_line);padding:16px 18px;overflow:auto;background:var(--_surface)}
.notes-closed segnavia-notes{display:none}
segnavia-caption{grid-area:caption;padding:6px 24px 10px;min-block-size:calc(var(--segnavia-caption-size,20px) * 1.5 * 2);overflow:hidden}
segnavia-caption[data-empty]{display:block}
.silent segnavia-caption{display:none}
.bar{grid-area:bar;display:flex;flex-direction:column;gap:4px;padding:8px 12px 12px}
:host([controls="overlay"]:not([data-presenting])) .player{grid-template-areas:"body" "below";grid-template-rows:auto auto}
:host([rail][controls="overlay"]:not([data-presenting])) .player{grid-template-columns:calc(var(--segnavia-rail-size,160px) + 24px) minmax(0,1fr);
  grid-template-areas:"rail body" "below below";grid-template-rows:auto auto}
:host([controls="overlay"]:not([data-presenting])){min-height:0}
:host([controls="overlay"]:not([data-presenting])) .body,:host([controls="overlay"]:not([data-presenting])) segnavia-caption,
:host([controls="overlay"]:not([data-presenting])) .bar{grid-area:body}
:host([controls="overlay"]:not([data-presenting])) .body{z-index:0}
:host([controls="overlay"]:not([data-presenting])) .screen{padding-block-end:0}
:host([controls="overlay"]:not([data-presenting])) segnavia-caption{z-index:1;align-self:end;padding-block-end:var(--segnavia-bar-height,96px);
  background:linear-gradient(to top,var(--segnavia-overlay-scrim,rgb(0 0 0 / .72)),transparent);color:#fff;transition:padding-block-end 160ms ease}
:host([controls="overlay"]:not([data-presenting])) .bar{z-index:2;align-self:end;color-scheme:dark;
  background:linear-gradient(to top,var(--segnavia-overlay-scrim,rgb(0 0 0 / .72)),transparent);transition:opacity 160ms ease}
:host([controls="overlay"][data-controls-hidden]:not([data-presenting])) .bar{opacity:0;pointer-events:none}
:host([controls="overlay"][data-controls-hidden]:not([data-presenting])) segnavia-caption{padding-block-end:10px}
segnavia-rail{grid-area:rail;min-block-size:0;display:none;border-inline-end:1px solid var(--_line);background:var(--_surface)}
/* Desk: size from the body row so the list scrolls. Compact restores auto height. */
:host([rail]) segnavia-rail{display:block;contain:size;block-size:0;min-block-size:100%;overflow:hidden}
.below{grid-area:below}
segnavia-track{inline-size:100%}
.control-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;min-block-size:var(--_play-size)}
.start,.center,.end{display:flex;align-items:center;gap:4px}.center{grid-column:2}.end{justify-self:end;min-inline-size:0}.start{justify-self:start}
.actions,.end-controls{display:contents}
:host(:not([data-actions])) .actions{display:none}
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
@container (max-width:${COMPACT_PLAYER_WIDTH}px){segnavia-counter,.time-separator,segnavia-notes{display:none}
  .player,:host([rail]) .player{grid-template-columns:minmax(0,1fr);grid-template-areas:"body" "caption" "bar" "rail" "below";grid-template-rows:auto auto auto auto auto}
  :host([data-layout="responsive"][fit="height"]) .player,:host([data-layout="responsive"][data-presenting]) .player{grid-template-rows:minmax(0,1fr) auto auto auto auto}
  :host([rail][controls="overlay"]:not([data-presenting])) .player{grid-template-columns:minmax(0,1fr);grid-template-areas:"body" "rail" "below";grid-template-rows:auto auto auto}
  .body{min-block-size:auto}.screen,:host([fit="height"]) .screen,:host([data-presenting]) .screen{container-type:normal;display:block;padding:0 0 4px}segnavia-stage,:host([fit="height"]) segnavia-stage,:host([data-presenting]) segnavia-stage{width:100%}segnavia-caption{min-block-size:0}
  :host([rail]) segnavia-rail{border-inline-end:0;border-block-start:1px solid var(--_line);contain:none;block-size:auto;min-block-size:0;overflow:visible}
  /* Compact: a light, even edge; the desk shadow's downward throw muddies the controls packed right under the slide. */
  :host(:not([data-presenting])) segnavia-stage{box-shadow:0 0 0 1px var(--_line),0 1px 3px rgb(0 0 0 / .06)}
  /* Compact: host actions leave the transport row and share one row at the bottom, below the rail, so none can overlap Play or push Present off-screen. */
  .control-row{grid-template-areas:"start center end" "actions actions actions";grid-template-rows:auto auto}
  .start{grid-area:start}.center{grid-area:center}.end{display:contents}
  .actions{display:flex;grid-area:actions;gap:8px;min-inline-size:0}
  /* Outranks the icon-button chrome a bare slotted <button> gets, so a text action stretches instead of collapsing to an icon square. */
  .actions slot[name="actions"]::slotted(*){flex:1 1 0;inline-size:auto;min-inline-size:0;box-sizing:border-box;padding-inline:12px}
  .end-controls{display:flex;grid-area:end;justify-self:end;align-items:center;gap:4px;min-inline-size:0}
  :host(:not([controls="overlay"]):not([data-presenting])) .player{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
    grid-template-areas:"body body body" "caption caption caption" "track track track" "start center end" "rail rail rail" "actions actions actions" "below below below";
    grid-template-rows:auto auto auto auto auto auto auto}
  :host([data-layout="responsive"][fit="height"]:not([controls="overlay"]):not([data-presenting])) .player{grid-template-rows:minmax(0,1fr) auto auto auto auto auto auto}
  :host(:not([controls="overlay"]):not([data-presenting])) :is(.bar,.control-row){display:contents}
  :host(:not([controls="overlay"]):not([data-presenting])) segnavia-track{grid-area:track;box-sizing:border-box;padding:8px 12px 4px}
  :host(:not([controls="overlay"]):not([data-presenting])) .start{padding-block-end:12px;padding-inline-start:12px}
  :host(:not([controls="overlay"]):not([data-presenting])) .center{padding-block-end:12px}
  :host(:not([controls="overlay"]):not([data-presenting])) .end-controls{padding-block-end:12px;padding-inline-end:12px}
  :host(:not([controls="overlay"]):not([data-presenting])) .actions{padding:12px;border-block-start:1px solid var(--_line)}}
@container (max-width:380px){.notes-toggle,segnavia-fullscreen{display:none}.end,.end-controls{--segnavia-control-size:28px;gap:0}}
@media (prefers-reduced-motion:reduce){:host([controls="overlay"]:not([data-presenting])) .bar,
  :host([controls="overlay"]:not([data-presenting])) segnavia-caption{transition:none}}
`
