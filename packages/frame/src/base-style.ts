// The only styles the headless elements bring: the geometry a slide, thumbnail, board, page, paper or book
// needs to display at all. Every selector sits inside :where(), so it has no
// specificity and any rule a host writes wins over it. Appearance (colors,
// borders, radius, type) is left entirely to the host; the few values that
// do appear are custom properties with plain defaults.
//
//   --segnavia-aspect            the stage's aspect ratio, set from the deck
//   --segnavia-canvas            the slide canvas behind its content
//   --segnavia-shot-backdrop     the canvas behind fitted images and shots
//   --segnavia-annotation-color  rings, badges and arrows
//   --segnavia-cue-fade          how long an annotation takes to appear
//   --segnavia-transition-duration how long a deck turn takes
//   --segnavia-transition-scale    the canvas fit scale used for slide travel
//   --segnavia-paper             the paper behind its placements
//   --segnavia-backdrop          the in-window presentation backdrop
//   --segnavia-board-selection-color the selected board item outline
//   --segnavia-board-marquee-color the board editing marquee border
//   --segnavia-board-marquee-fill the board editing marquee fill
//   --segnavia-board-handle-color the board editing handle border
//   --segnavia-board-handle-background the board editing handle fill

export const BASE_CSS = `
:where(segnavia-stage:not([unstyled])){display:block;position:relative;overflow:hidden;aspect-ratio:var(--segnavia-aspect,16/9)}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas){position:absolute;inset-inline-start:50%;inset-block-start:50%;transform-origin:center;background:var(--_segnavia-shot-backdrop,var(--segnavia-shot-backdrop,transparent));opacity:0;pointer-events:none}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-active]){opacity:1;pointer-events:auto;z-index:1}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-incoming]){z-index:2}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition][data-running]){transition-duration:var(--segnavia-transition-duration);transition-timing-function:ease;transition-property:opacity,translate}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="fade"][data-entering]){opacity:0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="fade"][data-entering][data-running]){opacity:1}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="slide"][data-entering]){opacity:1}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="slide"][data-entering][data-axis="right"]){translate:calc(100% * var(--segnavia-transition-scale)) 0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="slide"][data-entering][data-axis="left"]){translate:calc(-100% * var(--segnavia-transition-scale)) 0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="slide"][data-entering][data-running]){translate:0 0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="slide"][data-leaving][data-axis="right"][data-running]){translate:calc(-100% * var(--segnavia-transition-scale)) 0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas[data-transition="slide"][data-leaving][data-axis="left"][data-running]){translate:calc(100% * var(--segnavia-transition-scale)) 0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas > iframe){position:absolute;inset:0;inline-size:100%;block-size:100%;border:0;margin:0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__annotations){pointer-events:none;color:var(--segnavia-annotation-color,#e5484d)}
:where(segnavia-stage:not([unstyled]) [data-annotation]){opacity:0;transition:opacity var(--segnavia-cue-fade,160ms)}
:where(segnavia-stage:not([unstyled]) [data-annotation][data-shown]){opacity:1}
@media (prefers-reduced-motion:reduce){:where(segnavia-stage:not([unstyled]) [data-annotation]){transition:none}}
:where(:host(segnavia-thumbnail)){display:block;position:relative;overflow:hidden;aspect-ratio:var(--segnavia-aspect,16/9)}
:where(:host(segnavia-thumbnail) [part~="thumbnail"]){position:absolute;inset:0;overflow:hidden;border-radius:inherit}
:where(:host(segnavia-thumbnail) .segnavia-stage__canvas){position:absolute;inset-inline-start:50%;inset-block-start:50%;transform-origin:center;background:var(--segnavia-thumbnail-canvas,transparent);pointer-events:none}
:where(:host(segnavia-thumbnail) .segnavia-stage__canvas > iframe){position:absolute;inset:0;inline-size:100%;block-size:100%;border:0;margin:0}
:where(:host(segnavia-thumbnail) .segnavia-stage__annotations){pointer-events:none;color:var(--segnavia-annotation-color,#e5484d)}
:where(:host(segnavia-board:not([unstyled]))){display:block;position:relative;overflow:hidden;touch-action:none;background:var(--segnavia-board-background,transparent)}
:where(:host(segnavia-board:not([unstyled])) [part~="surface"]){position:absolute;inset:0;overflow:hidden}
:where(:host(segnavia-board:not([unstyled])) [part~="editing-overlay"]){position:absolute;inset:0;z-index:4;pointer-events:none}
:where(:host(segnavia-board:not([unstyled])) [part~="marquee"]){position:absolute;box-sizing:border-box;border:1px solid var(--segnavia-board-marquee-color,#2463eb);background:var(--segnavia-board-marquee-fill,rgba(36,99,235,.12))}
:where(:host(segnavia-board:not([unstyled])) [part~="resize-handle"]){position:absolute;box-sizing:border-box;inline-size:8px;block-size:8px;translate:-50% -50%;border:1px solid var(--segnavia-board-handle-color,#2463eb);background:var(--segnavia-board-handle-background,#fff);pointer-events:auto}
:where(:host(segnavia-board:not([unstyled]))[data-editing] [part~="item"][data-selected]){cursor:move}
:where(:host(segnavia-board:not([unstyled])) [part~="resize-handle"][data-corner="top-left"]),:where(:host(segnavia-board:not([unstyled])) [part~="resize-handle"][data-corner="bottom-right"]){cursor:nwse-resize}
:where(:host(segnavia-board:not([unstyled])) [part~="resize-handle"][data-corner="top-right"]),:where(:host(segnavia-board:not([unstyled])) [part~="resize-handle"][data-corner="bottom-left"]){cursor:nesw-resize}
:where(:host(segnavia-board:not([unstyled])) [part~="item"]){position:absolute;overflow:hidden;background:var(--segnavia-board-item,transparent)}
:where(:host(segnavia-board:not([unstyled])) [part~="item"][data-selected]){outline:2px solid var(--segnavia-board-selection-color,#2463eb);outline-offset:2px}
:where(:host(segnavia-board:not([unstyled])) [part~="item"] > :not(.shield)){display:block;position:absolute;inset:0;inline-size:100%;block-size:100%;object-fit:contain}
:where(:host(segnavia-board:not([unstyled])) .shield){position:absolute;inset:0;z-index:2;background:var(--segnavia-board-shield,transparent)}
:where(:host(segnavia-board:not([unstyled])) [part~="cover"]){background:var(--segnavia-board-cover,transparent)}
:where(:host(segnavia-board:not([unstyled])) [part~="placeholder"]){background:var(--segnavia-board-placeholder,transparent)}
:where(:host(segnavia-board:not([unstyled])) [part~="label"]){position:absolute;white-space:pre;unicode-bidi:isolate;color:var(--segnavia-board-label,currentColor)}
:where(:host(segnavia-board:not([unstyled])) [part~="item-title"]){position:absolute;translate:0 -100%;color:var(--segnavia-board-item-title,currentColor)}
:where(:host(segnavia-board:not([unstyled])) [part~="item-title"] > div){display:flex;flex-direction:row;align-items:center;gap:.25em;inline-size:100%;text-align:start}
:where(:host(segnavia-board:not([unstyled])) [part~="item-icon"]:empty){display:none}
:where(:host(segnavia-board:not([unstyled])) [part~="item-name"]){min-inline-size:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;unicode-bidi:isolate}
:where(:host(segnavia-board:not([unstyled])) [part~="item-actions"]){display:inline-flex;flex:none;margin-inline-start:auto;opacity:0;pointer-events:none}
:where(:host(segnavia-board:not([unstyled])) [part~="item"]:hover + [part~="item-title"] [part~="item-actions"]),:where(:host(segnavia-board:not([unstyled])) [part~="item"]:focus + [part~="item-title"] [part~="item-actions"]),:where(:host(segnavia-board:not([unstyled])) [part~="item-title"]:hover [part~="item-actions"]),:where(:host(segnavia-board:not([unstyled])) [part~="item-title"]:focus-within [part~="item-actions"]),:where(:host(segnavia-board:not([unstyled])) [part~="item"][data-selected] + [part~="item-title"] [part~="item-actions"]){opacity:1;pointer-events:auto}
:where(:host(segnavia-board:not([unstyled])) [part~="section"]){position:absolute;overflow:visible;background:var(--segnavia-board-section-fill,transparent);box-shadow:inset 0 0 0 1px var(--segnavia-board-section,currentColor)}
:where(:host(segnavia-board:not([unstyled])) [part~="section-title"]){position:absolute;inset-block-end:100%;inset-inline-start:0;white-space:pre;unicode-bidi:isolate;color:var(--segnavia-board-section-title,currentColor)}
:where(:host(segnavia-board-list)){display:block;color:var(--segnavia-board-list-color,currentColor);background:var(--segnavia-board-list-background,transparent)}
:where(:host(segnavia-board-list[hidden])){display:none}
:where(:host(segnavia-board-list) [part~="search"]){box-sizing:border-box;inline-size:100%;color:var(--segnavia-board-list-search-color,currentColor);background:var(--segnavia-board-list-search-background,transparent)}
:where(:host(segnavia-board-list) [part~="groups"]){display:block}
:where(:host(segnavia-board-list) [part~="group"]){text-align:start}
:where(:host(segnavia-board-list) [part~="group"] ul){margin-block:0;padding-inline-start:0}
:where(:host(segnavia-board-list) [part~="group"] li){display:block}
:where(:host(segnavia-board-list) [part~="group-title"]),:where(:host(segnavia-board-list) [part~="item"]){box-sizing:border-box;display:block;inline-size:100%;text-align:start;color:var(--segnavia-board-list-button-color,currentColor);background:var(--segnavia-board-list-button-background,transparent)}
:where(:host(segnavia-board-list) [part~="group-title"] > span),:where(:host(segnavia-board-list) [part~="item"] > span){display:inline-block;max-inline-size:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;text-align:match-parent;vertical-align:top}
:where(:host(segnavia-board-list) [part~="item"]){display:flex;flex-direction:row;align-items:center;gap:.25em}
:where(:host(segnavia-board-list) [part~="empty"]){color:var(--segnavia-board-list-empty-color,currentColor)}
:where(:host(segnavia-board-toolbar:not([unstyled])) [part~="toolbar"]){display:inline-flex;flex-direction:row;align-items:center;color:var(--segnavia-board-toolbar-color,currentColor);background:var(--segnavia-board-toolbar-background,transparent)}
:where(:host(segnavia-board-toolbar:not([unstyled])) button){display:inline-flex;align-items:center;justify-content:center;color:var(--segnavia-board-toolbar-button-color,currentColor);background:var(--segnavia-board-toolbar-button-background,transparent)}
:where(:host(segnavia-board-toolbar:not([unstyled])) button[hidden]){display:none}
:where(:host(segnavia-board-toolbar:not([unstyled])) [part~="icon"]){display:inline-block}
:where(segnavia-page:not([unstyled])){display:block;position:relative;overflow:hidden}
:where(segnavia-page:not([unstyled]) .segnavia-page__sheet){transform-origin:0 0}
:where(segnavia-page:not([unstyled]) .segnavia-page__sheet iframe){display:block;border:0;width:100%;height:100%}
:where(segnavia-book:not([unstyled])){display:block;overflow:hidden}
:where(segnavia-book:not([unstyled]) iframe){display:block;border:0;inline-size:100%;block-size:100%}
:where(segnavia-paper:not([unstyled])){display:block;position:relative;overflow:hidden;aspect-ratio:var(--segnavia-paper-aspect)}
:where(segnavia-paper:not([unstyled]) .segnavia-paper__paper){position:absolute;inset:0;transform-origin:0 0;background:var(--segnavia-paper,#fff)}
:where([data-presenting]),:where(:host([data-presenting])){position:fixed;inset-block:0;inset-inline:0;z-index:2147483647;background:var(--segnavia-backdrop,#111);overflow:auto}
`

// Adds the base styles once to the document, or to the shadow root an
// element lives in, since a document's styles do not reach inside one.
export function ensureBaseStyle(element: Element) {
  const root = element.getRootNode()
  const target = root instanceof ShadowRoot ? root : document.head
  if (target.querySelector('style[data-segnavia-base]')) return
  const style = document.createElement('style')
  style.dataset.segnaviaBase = ''
  style.textContent = BASE_CSS
  target.prepend(style)
}
