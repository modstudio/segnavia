// The styled text components: the spoken line and the speaker notes.
//
//   <segnavia-caption for="stage">   the narration, each word lit as it is spoken
//   <segnavia-notes for="stage">     the current slide's notes
//
// Both read in their text's own direction and language, whatever the page
// around them, and set data-empty when the slide has nothing to show.

import { resolveDirection } from '@segnavia/format'
import { SegnaviaControl } from './control.ts'
import type { DeckState } from './controller.ts'
import { TOKENS_CSS } from './controls-style.ts'

export class SegnaviaCaption extends SegnaviaControl {
  private slide = -1
  protected styles() {
    return `${TOKENS_CSS}:host{display:block;font-size:var(--segnavia-caption-size,clamp(15px,1.5vw + 8px,20px));line-height:1.5;
        text-align:var(--segnavia-caption-align,center);color:var(--_muted)}
      p{margin:0;unicode-bidi:plaintext}
      .spoken{color:var(--_ink)}
      .active{color:var(--_ink);background:color-mix(in srgb,var(--_accent) 28%,transparent);border-radius:4px;box-shadow:0 0 0 2px color-mix(in srgb,var(--_accent) 28%,transparent)}
      @media (prefers-reduced-motion:no-preference){span{transition:color .12s,background-color .12s}}`
  }
  protected markup() {
    return '<p part="caption"></p>'
  }
  // Words are laid out once per slide and only their classes change as they
  // are spoken, so the line never reflows under the reader.
  protected render(state: DeckState) {
    const line = this.root.querySelector('p') as HTMLParagraphElement
    const narration = state.slide?.narration
    this.toggleAttribute('data-empty', !narration)
    if (this.slide !== state.index) {
      this.slide = state.index
      line.replaceChildren()
      if (narration) {
        line.dir = resolveDirection(narration.dir, narration.lang ?? state.deck?.lang, narration.text)
        line.lang = narration.lang ?? state.deck?.lang ?? ''
        for (const word of narration.text.split(/\s+/).filter(Boolean)) {
          const span = document.createElement('span')
          span.textContent = word
          line.append(span, ' ')
        }
      }
    }
    line.querySelectorAll('span').forEach((span, index) => {
      span.className = state.word === null || index > state.word ? '' : index === state.word ? 'active' : 'spoken'
    })
  }
}

export class SegnaviaNotes extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}:host{display:block}
      h2{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--_muted)}
      p{margin:0;white-space:pre-wrap;unicode-bidi:plaintext}`
  }
  protected markup() {
    return '<h2 part="heading"></h2><p part="notes" dir="auto"></p>'
  }
  protected render(state: DeckState) {
    const notes = state.slide?.notes ?? ''
    this.toggleAttribute('data-empty', !notes)
    ;(this.root.querySelector('h2') as HTMLElement).textContent = this.labels.notes
    const text = this.root.querySelector('p') as HTMLParagraphElement
    text.textContent = notes
    text.lang = state.deck?.lang ?? ''
  }
}
