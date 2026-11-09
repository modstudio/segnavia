import {
  type Fill,
  type FillValues,
  hasSlotValue,
  resolveDirection,
  type SlotDeclaration,
  type SlotReport,
  type SlotValue,
  type TextDirection,
} from '@segnavia/format'
import { upgradeProperties } from './element-properties.ts'
import type { ItemSettingsController } from './item-settings-authoring.ts'
import type { ItemSettingsControls } from './item-settings-controls.ts'
import { type FieldsActions, type FieldsPanel, renderFields } from './item-settings-fields.ts'
import {
  addFill,
  cloneFill,
  cloneFills,
  cloneFillValues,
  isProvisionalFillId,
  nextSelectedFillId,
  provisionalFillId,
  removeFill,
  renameFill,
  selectedFill,
  setFillValue,
  setFillValuesValue,
} from './item-settings-fills.ts'
import { ENGLISH_ITEM_SETTINGS_LABELS, type ItemSettingsLabels, itemSettingsLabels } from './item-settings-labels.ts'
import type { ItemSettingsSection, ItemSettingsSectionContext } from './item-settings-section.ts'
import { ITEM_SETTINGS_CSS } from './item-settings-style.ts'
import { overrideValue, slotFieldView } from './item-settings-values.ts'

export { ITEM_SETTINGS_TAG } from './element-properties.ts'

const FIELDS_ID = 'fields'

export class SegnaviaItemSettings extends HTMLElement {
  static observedAttributes = ['dir', 'lang']

  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly sectionsEl: HTMLElement
  private hostSections: ItemSettingsSection[] = []
  private slotDeclarations: SlotDeclaration[] = []
  private fillList: Fill[] = []
  private selected: string | null = null
  private designValues: FillValues = {}
  private sourceFill: Fill | undefined
  private slotReport: SlotReport | undefined
  private words: ItemSettingsLabels = ENGLISH_ITEM_SETTINGS_LABELS
  private controlRenderers: ItemSettingsControls = {}
  private authoring: ItemSettingsController | null = null
  private drawn = false
  private fieldsArticle: HTMLElement | undefined
  private fieldsTitle: HTMLElement | undefined
  private fieldsPanel: FieldsPanel | undefined

  constructor() {
    super()
    upgradeProperties(this)
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
    const authoring = this.authoring
    if (authoring) this.fillList = authoring.seedFills(this.fillList)
    this.render()
  }

  get fill(): string | null {
    return this.selected
  }

  set fill(value: string | null | undefined) {
    this.selected = value ?? null
    this.render()
  }

  get overrides(): FillValues {
    return cloneFillValues(this.designValues)
  }

  set overrides(value: FillValues | undefined) {
    this.designValues = cloneFillValues(value ?? {})
    const authoring = this.authoring
    if (authoring) this.designValues = authoring.seedOverrides(this.designValues)
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

  get controls(): ItemSettingsControls {
    return this.controlRenderers
  }

  set controls(value: ItemSettingsControls | undefined) {
    this.controlRenderers = value ?? {}
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

  private emitInput(fill: Fill) {
    if (isProvisionalFillId(fill.id)) return
    this.dispatchEvent(new CustomEvent<Fill>('segnavia-fill-input', { detail: cloneFill(fill), bubbles: true, composed: true }))
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
      overrides: this.designValues,
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

  private fieldActions(): FieldsActions {
    return {
      pickAsset: this.authoring?.pickAsset,
      onSelectFill: (id) => this.selectFill(id),
      onAddFill: () => this.addNewFill(),
      onRemoveFill: () => this.removeSelectedFill(),
      onRenameFill: (label) => this.renameSelected(label),
      onChangeValue: (key, value) => this.changeValue(key, value),
      onDesignOnly: this.authoring?.canSaveOverrides ? (key, enabled) => this.toggleDesignOnly(key, enabled) : undefined,
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
    if (fill) {
      this.emitInput(fill)
      this.authoring?.save(fill)
    }
  }

  private changeValue(key: string, value: SlotValue | undefined) {
    if (this.authoring?.canSaveOverrides && hasSlotValue(this.designValues[key])) {
      this.changeDesignValue(key, value)
      return
    }
    if (this.selected === null) return
    this.fillList = setFillValue(this.fillList, this.selected, key, value)
    this.render()
    const fill = selectedFill(this.fillList, this.selected)
    if (fill) {
      this.emitInput(fill)
      this.authoring?.save(fill)
    }
  }

  private toggleDesignOnly(key: string, enabled: boolean) {
    if (!this.authoring?.canSaveOverrides) return
    if (!enabled) {
      this.changeDesignValue(key, undefined)
      return
    }
    const slot = this.slotDeclarations.find((declaration) => declaration.key === key)
    if (!slot) return
    const fill = selectedFill(this.fillList, this.selected)
    const value = slotFieldView(slot, this.designValues, fill, this.sourceFill, this.slotReport).value
    this.changeDesignValue(key, value)
  }

  private changeDesignValue(key: string, value: SlotValue | undefined) {
    this.designValues = setFillValuesValue(this.designValues, key, value)
    this.render()
    this.authoring?.saveDesign(this.designValues)
  }

  private render() {
    if (!this.drawn) return
    const context = this.context()
    this.sectionsEl.dir = context.dir
    this.renderFieldsSection(context)
    for (const child of [...this.sectionsEl.children]) if (child !== this.fieldsArticle) child.remove()
    for (const section of this.hostSections) this.mountSection(section, context)
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
    title.append(isolated(section.label))
    const body = document.createElement('div')
    body.part.add('section-body')
    article.append(title, body)
    this.sectionsEl.append(article)
    section.render(body, context)
  }

  private renderFieldsSection(context: ItemSettingsSectionContext) {
    if (this.slotDeclarations.length === 0) {
      this.fieldsPanel?.dispose()
      this.fieldsPanel = undefined
      this.fieldsArticle?.remove()
      this.fieldsArticle = undefined
      this.fieldsTitle = undefined
      return
    }
    if (!this.fieldsArticle) {
      const article = document.createElement('section')
      article.part.add('section')
      article.dataset.section = FIELDS_ID
      const title = document.createElement('h2')
      title.part.add('section-title')
      const body = document.createElement('div')
      body.part.add('section-body')
      article.append(title, body)
      this.fieldsArticle = article
      this.fieldsTitle = title
      this.fieldsPanel = renderFields(body, context, this.fieldActions(), this.controlRenderers)
      this.sectionsEl.insertBefore(article, this.sectionsEl.firstChild)
    } else {
      this.fieldsPanel?.update(context, this.fieldActions(), this.controlRenderers)
      if (this.sectionsEl.firstChild !== this.fieldsArticle) this.sectionsEl.insertBefore(this.fieldsArticle, this.sectionsEl.firstChild)
    }
    this.fieldsTitle?.replaceChildren(isolated(this.words.fields))
  }
}

function isolated(text: string): HTMLElement {
  const bdi = document.createElement('bdi')
  bdi.textContent = text
  return bdi
}
