import type { OriginApproval } from '@segnavia/format'

export class ThumbnailProperties extends HTMLElement {
  private originOptions: readonly OriginApproval[] = []
  private stylesheet = ''

  /** The host stylesheet an HTML slide is drawn with, as the stage's `css`. */
  get css(): string {
    return this.stylesheet
  }

  set css(value: string) {
    this.stylesheet = value
    this.thumbnailPropertiesChanged()
  }

  get origins(): Iterable<OriginApproval> {
    return this.originOptions
  }

  set origins(value: Iterable<OriginApproval>) {
    this.originOptions = [...value]
    this.thumbnailPropertiesChanged()
  }

  protected thumbnailPropertiesChanged(): void {}
}
