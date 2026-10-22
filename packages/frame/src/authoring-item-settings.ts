import type { AuthoringPrintMoment } from './authoring-print-moment.ts'
import { itemSettingsOpenEvent } from './item-settings-open.ts'
import type { ItemSettingsSection } from './item-settings-section.ts'
import type { SegnaviaPlayer } from './player.ts'

export class AuthoringItemSettings {
  private enabled = false
  private attached = false

  constructor(
    private player: SegnaviaPlayer,
    private printMoment: () => AuthoringPrintMoment | null,
    enabled: boolean,
  ) {
    this.update(enabled)
  }

  update(enabled: boolean) {
    if (enabled === this.enabled) return
    this.enabled = enabled
    if (enabled) {
      this.attached = true
      this.player.addEventListener('segnavia-labels', this.sync)
      this.sync()
    } else this.dispose()
  }

  dispose() {
    if (!this.attached) return
    this.attached = false
    this.enabled = false
    this.player.removeEventListener('segnavia-labels', this.sync)
    this.player.authoringRail().setItemSettings(null, null)
  }

  section(): ItemSettingsSection {
    return {
      id: 'slide',
      label: this.player.labels.slideSettings,
      render: (container) => {
        const printMoment = this.printMoment()
        if (printMoment) return printMoment.renderSection(container)
        const note = document.createElement('p')
        note.dir = 'auto'
        note.textContent = this.player.labels.noSettingsForSlide
        container.append(note)
      },
    }
  }

  private sync = () => {
    this.player.authoringRail().setItemSettings(this.enabled ? this.player.labels.itemSettings : null, this.enabled ? this.open : null)
  }

  private open = () => {
    const slideId = this.player.controller.state.slide?.id
    if (slideId) this.player.dispatchEvent(itemSettingsOpenEvent({ slideId }))
  }
}
