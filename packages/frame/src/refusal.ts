import { type Refusal, resolveDirection } from '@segnavia/format'
import { TOKENS_CSS } from './controls-style.ts'
import { upgradeProperties } from './element-properties.ts'
import { ENGLISH_LABELS, type PlayerLabels, playerLabels } from './labels.ts'

export class SegnaviaRefusal extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' })
  private value: Refusal | null = null
  private words = ENGLISH_LABELS

  constructor() {
    super()
    this.root.innerHTML = `<style>${TOKENS_CSS}
      :host{box-sizing:border-box;display:grid;place-items:center;padding:clamp(20px,6%,64px);background:var(--_bg)}
      :host([hidden]){display:none}
      section{box-sizing:border-box;inline-size:min(100%,560px);padding:clamp(20px,5%,40px);border:1px solid var(--_line);border-radius:var(--_radius);background:var(--_surface);box-shadow:0 12px 40px rgb(0 0 0 / .18)}
      h2{margin:0 0 10px;font-size:clamp(18px,2.5cqi,28px);line-height:1.2;color:var(--_ink)}
      p{margin:0;color:var(--_muted);white-space:pre-wrap;unicode-bidi:plaintext}</style>
      <section part="panel"><h2 part="heading"></h2><p part="message" dir="auto"></p></section>`
    upgradeProperties(this)
    this.render()
  }

  get refusal(): Refusal | null {
    return this.value
  }

  set refusal(value: Refusal | null) {
    this.value = value
    this.render()
  }

  get labels(): PlayerLabels {
    return this.words
  }

  set labels(value: Partial<PlayerLabels>) {
    this.words = playerLabels(value)
    this.render()
  }

  private render() {
    this.hidden = this.value === null
    const heading = this.root.querySelector('h2') as HTMLHeadingElement
    heading.textContent = this.words.refused
    heading.dir = resolveDirection(undefined, undefined, this.words.refused)
    ;(this.root.querySelector('p') as HTMLParagraphElement).textContent = this.value?.message ?? ''
  }
}
