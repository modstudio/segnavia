// The only styles the headless elements bring: the geometry a slide or page
// needs to display at all. Every selector sits inside :where(), so it has no
// specificity and any rule a host writes wins over it. Appearance (colours,
// borders, radius, type) is left entirely to the host; the few values that
// do appear are custom properties with plain defaults.
//
//   --segnavia-aspect            the stage's aspect ratio, set from the deck
//   --segnavia-canvas            the slide canvas behind its content
//   --segnavia-annotation-color  rings, badges and arrows
//   --segnavia-cue-fade          how long an annotation takes to appear

export const BASE_CSS = `
:where(segnavia-stage:not([unstyled])){display:block;position:relative;overflow:hidden;aspect-ratio:var(--segnavia-aspect,16/9)}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas){position:absolute;left:50%;top:50%;transform-origin:center;background:var(--segnavia-canvas,#fff)}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__canvas > *){position:absolute;inset:0;width:100%;height:100%;border:0;margin:0}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__image){object-fit:contain}
:where(segnavia-stage:not([unstyled]) .segnavia-stage__annotations){pointer-events:none;color:var(--segnavia-annotation-color,#e5484d)}
:where(segnavia-stage:not([unstyled]) [data-annotation]){opacity:0;transition:opacity var(--segnavia-cue-fade,160ms)}
:where(segnavia-stage:not([unstyled]) [data-annotation][data-shown]){opacity:1}
@media (prefers-reduced-motion:reduce){:where(segnavia-stage:not([unstyled]) [data-annotation]){transition:none}}
:where(segnavia-page:not([unstyled])){display:block;position:relative;overflow:hidden}
:where(segnavia-page:not([unstyled]) .segnavia-page__sheet){transform-origin:0 0}
:where(segnavia-page:not([unstyled]) .segnavia-page__sheet iframe){display:block;border:0;width:100%;height:100%}
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
