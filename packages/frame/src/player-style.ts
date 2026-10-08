// The player's layout. Its look comes from the styled components inside it,
// so theming the player and theming the components are the same act: set
// `--segnavia-*` properties, or `theme`, on the player or any ancestor.

import { TOKENS_CSS } from './controls-style.ts'

export const PLAYER_CSS = `${TOKENS_CSS}
:host{display:block;position:relative;container-type:inline-size;background:var(--_bg);border-radius:var(--_radius);overflow:hidden;min-height:240px;
  font-size:15px;line-height:1.45}
:host(:not([theme])){color-scheme:light dark}
:host(:fullscreen){border-radius:0}
.player{display:flex;flex-direction:column;height:100%;min-height:inherit}
.body{flex:1;min-height:0;display:flex}
.screen{flex:1;min-width:0;container-type:size;display:grid;place-items:center;padding:16px 16px 8px}
segnavia-stage{width:min(100cqw,100cqh * var(--ratio,1.7778));height:auto;border-radius:calc(var(--_radius) - 4px);
  box-shadow:0 1px 2px rgb(0 0 0 / .18),0 10px 30px rgb(0 0 0 / .22);--segnavia-canvas:#fff}
segnavia-stage:focus-visible{outline:2px solid var(--_accent);outline-offset:3px}
segnavia-notes{inline-size:clamp(200px,28%,340px);border-inline-start:1px solid var(--_line);padding:16px 18px;overflow:auto;background:var(--_surface)}
.notes-closed segnavia-notes{display:none}
segnavia-caption{padding:6px 24px 10px;min-block-size:calc(var(--segnavia-caption-size,20px) * 1.5 * 2);overflow:hidden}
segnavia-caption[data-empty]{display:block}
.silent segnavia-caption{display:none}
.bar{display:flex;align-items:center;gap:6px;padding:8px 12px 12px}
segnavia-track{flex:1;margin:0 8px}
segnavia-counter{padding-inline:6px}
.notes-toggle{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;inline-size:36px;block-size:36px;border-radius:10px;color:var(--_ink);cursor:pointer}
.notes-toggle:hover{background:var(--_line)}
.notes-toggle:focus-visible{outline:2px solid var(--_accent);outline-offset:1px}
.notes-toggle svg{inline-size:20px;block-size:20px}
.notes-toggle[hidden]{display:none}
@container (max-width:560px){segnavia-counter,segnavia-notes{display:none}segnavia-track{order:-1;flex-basis:100%;margin:0 4px 4px}.bar{flex-wrap:wrap}
  .body{flex:none}.screen{container-type:normal;display:block;padding:12px 12px 4px}segnavia-stage{width:100%}segnavia-caption{min-block-size:0}}
@container (max-width:380px){.notes-toggle,segnavia-fullscreen{display:none}}
`
