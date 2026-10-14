// The only styles the headless elements bring: the geometry a slide, page or paper
// needs to display at all. Every selector sits inside :where(), so it has no
// specificity and any rule a host writes wins over it. Appearance (colors,
// borders, radius, type) is left entirely to the host; the few values that
// do appear are custom properties with plain defaults.
//
//   --segnavia-aspect            the stage's aspect ratio, set from the deck
//   --segnavia-canvas            the slide canvas behind its content
//   --segnavia-annotation-color  rings, badges and arrows
//   --segnavia-cue-fade          how long an annotation takes to appear
//   --segnavia-transition-duration how long a deck turn takes
//   --segnavia-transition-scale    the canvas fit scale used for slide travel
//   --segnavia-paper             the paper behind its placements
//   --segnavia-backdrop          the in-window presentation backdrop

export const BASE_CSS = `
:where(segnavia-stage:not([unstyled])){display:block;position:relative;overflow:hidden;aspect-ratio:var(--segnavia-aspect,16/9)}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas){position:absolute;inset-inline-start:50%;inset-block-start:50%;transform-origin:center;background:var(--segnavia-canvas,#fff);opacity:0;pointer-events:none}
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
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas > *){position:absolute;inset:0;inline-size:100%;block-size:100%;border:0;margin:0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__image){object-fit:contain}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__annotations){pointer-events:none;color:var(--segnavia-annotation-color,#e5484d)}
:where(segnavia-stage:not([unstyled]) [data-annotation]){opacity:0;transition:opacity var(--segnavia-cue-fade,160ms)}
:where(segnavia-stage:not([unstyled]) [data-annotation][data-shown]){opacity:1}
@media (prefers-reduced-motion:reduce){:where(segnavia-stage:not([unstyled]) [data-annotation]){transition:none}}
:where(segnavia-page:not([unstyled])){display:block;position:relative;overflow:hidden}
:where(segnavia-page:not([unstyled]) .segnavia-page__sheet){transform-origin:0 0}
:where(segnavia-page:not([unstyled]) .segnavia-page__sheet iframe){display:block;border:0;width:100%;height:100%}
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
