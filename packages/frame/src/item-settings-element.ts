import { type Fill, resolveDirection, type SlotDeclaration, type SlotReport, type SlotValue, type TextDirection } from '@segnavia/format'
import type { ItemSettingsController } from './item-settings-authoring.ts'
import { type FieldsActions, renderFields } from './item-settings-fields.ts'
import {
  addFill,
  cloneFill,
  cloneFills,
  isProvisionalFillId,
  nextSelectedFillId,
  provisionalFillId,
  removeFill,
  renameFill,
  selectedFill,
  setFillValue,
} from './item-settings-fills.ts'
import { ENGLISH_ITEM_SETTINGS_LABELS, type ItemSettingsLabels, itemSettingsLabels } from './item-settings-labels.ts'
import type { ItemSettingsSection, ItemSettingsSectionContext } from './item-settings-section.ts'
import { ITEM_SETTINGS_CSS } from './item-settings-style.ts'
import { overrideValue } from './item-settings-values.ts'

export const ITEM_SETTINGS_TAG = 'segnavia-item-settings'
const FIELDS_ID = 'fields'

interface FocusSnapshot {
  slot?: string
  action?: string
  part: string
  tag: string
  type: string
  start: number | null
}

export class SegnaviaItemSettings extends HTMLElement {
  static observedAttributes = ['dir', 'lang']

  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly sectionsEl: HTMLElement
  private hostSections: ItemSettingsSection[] = []
  private slotDeclarations: SlotDeclaration[] = []
  private fillList: Fill[] = []
  private selected: string | null = null
  private sourceFill: Fill | undefined
  private slotReport: SlotReport | undefined
  private words: ItemSettingsLabels = ENGLISH_ITEM_SETTINGS_LABELS
  private authoring: ItemSettingsController | null = null
  private drawn = false

  constructor() {
    super()
    const style = document.createElement('style')
    style.textContent = ITEM_SETTINGS_CSS
    this.sectionsEl = document.createElement('div')
    this.sectionsEl.part.add('sections')
    this.root.append(style, this.sectionsEl)
  }

  get declarations(): SlotDeclaration[] {
    return this.slotDeclarations.map((slot) => ({ ...slot }))
  }

  set declarations(value: readonly SlotDeclaration[] | undefined) {
    this.slotDeclarations = (value ?? []).map((slot) => ({ ...slot }))
    this.render()
  }

  get fills(): Fill[] {
    return cloneFills(this.fillList)
  }

  set fills(value: readonly Fill[] | undefined) {
    this.fillList = cloneFills(value ?? [])
    this.authoring?.seedFills(this.fillList)
    this.render()
  }

  get fill(): string | null {
    return this.selected
  }

  set fill(value: string | null | undefined) {
    this.selected = value ?? null
    this.render()
  }

  get source(): Fill | undefined {
    return this.sourceFill ? cloneFill(this.sourceFill) : undefined
  }

  set source(value: Fill | undefined) {
    this.sourceFill = value ? cloneFill(value) : undefined
    this.render()
  }

  get report(): SlotReport | undefined {
    return this.slotReport
  }

  set report(value: SlotReport | undefined) {
    this.slotReport = value
    this.render()
  }

  get labels(): ItemSettingsLabels {
    return this.words
  }

  set labels(value: Partial<ItemSettingsLabels> | undefined) {
    this.words = itemSettingsLabels(value)
    this.render()
  }

  addSection(section: ItemSettingsSection): () => void {
    if (section.id === FIELDS_ID || this.hostSections.some((item) => item.id === section.id)) {
      throw new RangeError(`Section "${section.id}" is already present.`)
    }
    this.hostSections = [...this.hostSections, section]
    this.render()
    return () => {
      this.hostSections = this.hostSections.filter((item) => item.id !== section.id)
      this.render()
    }
  }

  connectAuthoring(controller: ItemSettingsController) {
    this.authoring = controller
    this.render()
  }

  disconnectAuthoring() {
    this.authoring = null
    this.render()
  }

  emitSelect(id: string) {
    if (isProvisionalFillId(id)) return
    this.dispatchEvent(new CustomEvent<string>('segnavia-fill-select', { detail: id, bubbles: true, composed: true }))
  }

  connectedCallback() {
    this.drawn = true
    this.render()
  }

  attributeChangedCallback() {
    if (this.drawn) this.render()
  }

  private context(): ItemSettingsSectionContext {
    return {
      declarations: this.slotDeclarations,
      fills: this.fillList,
      fill: this.selected,
      source: this.sourceFill,
      report: this.slotReport,
      labels: this.words,
      dir: this.direction(),
    }
  }

  private direction(): TextDirection {
    const dir = this.getAttribute('dir')
    const declared = dir === 'ltr' || dir === 'rtl' || dir === 'auto' ? dir : undefined
    return resolveDirection(declared, this.getAttribute('lang') ?? this.lang, '')
  }

  private orderedSections(): ItemSettingsSection[] {
    const fields: ItemSettingsSection[] =
      this.slotDeclarations.length === 0
        ? []
        : [{ id: FIELDS_ID, label: this.words.fields, render: (container, context) => renderFields(container, context, this.fieldActions()) }]
    return [...fields, ...this.hostSections]
  }

  private fieldActions(): FieldsActions {
    return {
      pickAsset: this.authoring?.pickAsset,
      onSelectFill: (id) => this.selectFill(id),
      onAddFill: () => this.addNewFill(),
      onRemoveFill: () => this.removeSelectedFill(),
      onRenameFill: (label) => this.renameSelected(label),
      onChangeValue: (key, value) => this.changeValue(key, value),
      onOverride: (key) => this.changeValue(key, overrideValue(this.sourceFill, key)),
      onUseSource: (key) => this.changeValue(key, undefined),
    }
  }

  private selectFill(id: string) {
    this.selected = id
    this.render()
    this.emitSelect(id)
  }

  private addNewFill() {
    const fill: Fill = { id: this.authoring ? provisionalFillId() : crypto.randomUUID(), label: this.words.newFill, values: {} }
    this.fillList = addFill(this.fillList, fill)
    this.selected = fill.id
    this.render()
    this.authoring?.create(fill)
  }

  private removeSelectedFill() {
    if (this.selected === null) return
    const id = this.selected
    const previousFills = cloneFills(this.fillList)
    const previousSelected = this.selected
    const remaining = removeFill(this.fillList, id)
    this.fillList = remaining
    this.selected = nextSelectedFillId(remaining, id, id)
    this.render()
    this.authoring?.delete(id, previousFills, previousSelected)
  }

  private renameSelected(label: string) {
    if (this.selected === null) return
    this.fillList = renameFill(this.fillList, this.selected, label)
    this.render()
    const fill = selectedFill(this.fillList, this.selected)
    if (fill) this.authoring?.save(fill)
  }

  private changeValue(key: string, value: SlotValue | undefined) {
    if (this.selected === null) return
    this.fillList = setFillValue(this.fillList, this.selected, key, value)
    this.render()
    const fill = selectedFill(this.fillList, this.selected)
    if (fill) this.authoring?.save(fill)
  }

  private render() {
    if (!this.drawn) return
    const focus = this.snapshotFocus()
    const context = this.context()
    this.sectionsEl.dir = context.dir
    this.sectionsEl.replaceChildren()
    for (const section of this.orderedSections()) this.mountSection(section, context)
    this.restoreFocus(focus)
  }

  refresh() {
    this.render()
  }

  private mountSection(section: ItemSettingsSection, context: ItemSettingsSectionContext) {
    const article = document.createElement('section')
    article.part.add('section')
    article.dataset.section = section.id
    const title = document.createElement('h2')
    title.part.add('section-title')
    title.textContent = section.label
    const body = document.createElement('div')
    body.part.add('section-body')
    article.append(title, body)
    this.sectionsEl.append(article)
    section.render(body, context)
  }

  private snapshotFocus(): FocusSnapshot | null {
    const active = this.root.activeElement
    if (!(active instanceof HTMLElement)) return null
    const slot = (active.closest('[data-key]') as HTMLElement | null)?.dataset.key
    return {
      slot,
      action: active.dataset.action,
      part: [...active.part].join(' '),
      tag: active.tagName,
      type: active instanceof HTMLInputElement || active instanceof HTMLSelectElement ? active.type : '',
      start: active instanceof HTMLInputElement ? active.selectionStart : null,
    }
  }

  private restoreFocus(snapshot: FocusSnapshot | null) {
    if (!snapshot) return
    const candidates = [...this.root.querySelectorAll<HTMLElement>(snapshot.tag)]
    const match = candidates.find((node) => {
      const slot = (node.closest('[data-key]') as HTMLElement | null)?.dataset.key
      const type = node instanceof HTMLInputElement || node instanceof HTMLSelectElement ? node.type : ''
      return slot === snapshot.slot && node.dataset.action === snapshot.action && [...node.part].join(' ') === snapshot.part && type === snapshot.type
    })
    match?.focus()
    if (match instanceof HTMLInputElement && snapshot.start !== null) match.setSelectionRange(snapshot.start, snapshot.start)
  }
}
