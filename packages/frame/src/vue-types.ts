import type { DocumentInput, Fill, FillValues, Print, PrintInput, PrintSetting, SlotDeclaration, SlotReport, TransitionInput } from '@segnavia/format'
import type { PaperPickerLabelOverrides } from './controls-entry.ts'
import type { ItemSettingsControls } from './item-settings-controls.ts'
import type { ItemSettingsLabels } from './item-settings-labels.ts'
import type { PlayerLabels } from './labels.ts'
import type { PageOrPrintedInput } from './printed-page-document.ts'

export type Assert<T extends true> = T

export type ElementPropertyWrites = {
  stage: { transition: TransitionInput | 'none' }
  thumbnail: {
    deck: DocumentInput | null
    page: DocumentInput | null | undefined
    print: PrintInput | Print | null | undefined
  }
  board: { board: DocumentInput | null }
  page: { page: DocumentInput | null | undefined }
  document: { pages: PageOrPrintedInput[] | undefined; print: PrintInput | null | undefined }
  book: { view: unknown }
  player: { labels: Partial<PlayerLabels>; transition: TransitionInput | 'none' }
  play: { labels: Partial<PlayerLabels> }
  step: { labels: Partial<PlayerLabels> }
  track: { labels: Partial<PlayerLabels> }
  counter: { labels: Partial<PlayerLabels> }
  time: { labels: Partial<PlayerLabels> }
  mute: { labels: Partial<PlayerLabels> }
  captions: { labels: Partial<PlayerLabels> }
  caption: { labels: Partial<PlayerLabels> }
  notes: { labels: Partial<PlayerLabels> }
  fullscreen: { labels: Partial<PlayerLabels> }
  rail: { labels: Partial<PlayerLabels> }
  paperPicker: { value: PrintSetting | undefined; labels: PaperPickerLabelOverrides | undefined }
  itemSettings: {
    declarations: readonly SlotDeclaration[] | undefined
    fills: readonly Fill[] | undefined
    fill: string | null | undefined
    overrides: FillValues | undefined
    source: Fill | undefined
    report: SlotReport | undefined
    labels: Partial<ItemSettingsLabels> | undefined
    controls: ItemSettingsControls | undefined
  }
}

export type CamelEvent<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Capitalize<Head>}${CamelEvent<Tail>}` : Capitalize<S>

export type EventProps<Events extends readonly string[], Details extends Record<Events[number], unknown>> = {
  [E in Events[number] as `on${CamelEvent<E>}`]?: (event: CustomEvent<Details[E]>) => void
}
