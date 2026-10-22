import type { AuthoringController } from './authoring.ts'
import type { ItemSettingsSection } from './item-settings-section.ts'

export function slideSettingsSection(authoring: AuthoringController): ItemSettingsSection {
  return authoring.slideSettingsSection()
}
