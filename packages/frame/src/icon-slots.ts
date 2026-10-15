import { ICONS } from './icons.ts'

export type IconName = keyof typeof ICONS

export const iconSlotName = (name: IconName) => `icon-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`

export const iconSlot = (name: IconName) => `<slot name="${iconSlotName(name)}">${ICONS[name]}</slot>`

export const forwardedIconSlot = (name: IconName) => {
  const slot = iconSlotName(name)
  return `<slot name="${slot}" slot="${slot}">${ICONS[name]}</slot>`
}
