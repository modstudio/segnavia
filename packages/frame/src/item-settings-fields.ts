import type { SlotDeclaration, SlotState, SlotValue } from '@segnavia/format'
import {
  type ItemSettingsActionKind,
  type ItemSettingsActionView,
  type ItemSettingsControlRenderer,
  type ItemSettingsControls,
  type ItemSettingsFieldView,
  type ItemSettingsRenderedControl,
  nativeAction,
  nativeAsset,
  nativeField,
  nativeFillSwitcher,
} from './item-settings-controls.ts'
import type { ItemSettingsLabels } from './item-settings-labels.ts'
import type { ItemSettingsSectionContext } from './item-settings-section.ts'
import { type SlotFieldView, slotFieldView } from './item-settings-values.ts'

const SLOT_STATE_LABEL_KEYS = {
  filled: 'stateFilled',
  placeholder: 'statePlaceholder',
  unavailable: 'stateUnavailable',
  invalid: 'stateInvalid',
  fit: 'stateFit',
  shrunk: 'stateShrunk',
  overflowed: 'stateOverflowed',
} as const satisfies Record<SlotState, keyof ItemSettingsLabels>

export interface FieldsActions {
  pickAsset?: (slot: SlotDeclaration) => Promise<SlotValue | undefined>
  onSelectFill(id: string): void
  onAddFill(): void
  onRemoveFill(): void
  onRenameFill(label: string): void
  onChangeValue(key: string, value: SlotValue | undefined): void
  onDesignOnly?(key: string, enabled: boolean): void
  onOverride(key: string): void
  onUseSource(key: string): void
}
interface MountedControl<View> {
  renderer: ItemSettingsControlRenderer<View, never>
  control: ItemSettingsRenderedControl<View>
}
interface SlotMount {
  field: HTMLElement
  caption: HTMLElement
  actions: HTMLElement
  feedback: HTMLElement[]
  kind: 'field' | 'asset'
  main: MountedControl<ItemSettingsFieldView>
  actionControls: Map<ItemSettingsActionKind, MountedControl<ItemSettingsActionView>>
}

export class FieldsPanel {
  private readonly switcher = document.createElement('div')
  private readonly slots = document.createElement('div')
  private fillControl: MountedControl<Parameters<typeof nativeFillSwitcher>[0]> | undefined
  private slotControls = new Map<string, SlotMount>()
  private actions!: FieldsActions
  private context!: ItemSettingsSectionContext
  private controls: ItemSettingsControls = {}

  constructor(container: HTMLElement) {
    this.switcher.part.add('fills')
    this.slots.part.add('slots')
    container.append(this.switcher, this.slots)
  }

  update(context: ItemSettingsSectionContext, actions: FieldsActions, controls: ItemSettingsControls = {}) {
    this.context = context
    this.actions = actions
    this.controls = controls
    this.updateFillSwitcher()
    const retained = new Set<string>()
    for (const [index, declaration] of context.declarations.entries()) {
      retained.add(declaration.key)
      const view = this.fieldView(declaration)
      const kind = declaration.type === 'image' ? 'asset' : 'field'
      let mount = this.slotControls.get(declaration.key)
      let created = false
      if (!mount || mount.kind !== kind) {
        if (mount) {
          this.disposeSlot(mount)
          mount.field.remove()
        }
        mount = this.createSlot(declaration, view, kind)
        this.slotControls.set(declaration.key, mount)
        created = true
      }
      this.updateSlot(mount, declaration, view, !created)
      if (this.slots.children[index] !== mount.field) this.slots.insertBefore(mount.field, this.slots.children[index] ?? null)
    }
    for (const [key, mount] of this.slotControls)
      if (!retained.has(key)) {
        this.disposeSlot(mount)
        mount.field.remove()
        this.slotControls.delete(key)
      }
  }

  dispose() {
    this.fillControl?.control.dispose()
    for (const mount of this.slotControls.values()) this.disposeSlot(mount)
    this.slotControls.clear()
  }

  private updateFillSwitcher() {
    const view = { fills: this.context.fills, fill: this.context.fill, dir: this.context.dir, labels: this.context.labels }
    const renderer = this.controls.fillSwitcher ?? nativeFillSwitcher
    if (!this.fillControl || this.fillControl.renderer !== renderer) {
      this.fillControl?.control.dispose()
      const control = renderer(view, {
        onSelect: (id) => this.actions.onSelectFill(id),
        onRename: (label) => this.actions.onRenameFill(label),
        onAdd: () => this.actions.onAddFill(),
        onRemove: () => this.actions.onRemoveFill(),
      })
      this.fillControl = { renderer: renderer as ItemSettingsControlRenderer<typeof view, never>, control }
      this.switcher.replaceChildren(control.element)
    } else this.fillControl.control.update(view)
  }

  private fieldView(declaration: SlotDeclaration): ItemSettingsFieldView {
    const fill = this.context.fills.find((item) => item.id === this.context.fill)
    return {
      ...slotFieldView(declaration, this.context.overrides, fill, this.context.source, this.context.report, this.actions.onDesignOnly !== undefined),
      declaration,
      canPickAsset: this.actions.pickAsset !== undefined,
      dir: this.context.dir,
      labels: this.context.labels,
    }
  }

  private createSlot(declaration: SlotDeclaration, view: ItemSettingsFieldView, kind: 'field' | 'asset'): SlotMount {
    const field = document.createElement('div')
    field.part.add('slot')
    field.dataset.key = declaration.key
    const caption = document.createElement('span')
    const actions = document.createElement('div')
    actions.part.add('slot-actions')
    const renderer = kind === 'asset' ? (this.controls.asset ?? nativeAsset) : (this.controls.field ?? nativeField)
    const callbacks =
      kind === 'asset'
        ? { onChange: (value: SlotValue | undefined) => this.actions.onChangeValue(declaration.key, value), pickAsset: () => this.pickAsset(declaration.key) }
        : { onChange: (value: SlotValue | undefined) => this.actions.onChangeValue(declaration.key, value) }
    const rendered = renderer(view, callbacks as never)
    rendered.element.dataset.slot = declaration.key
    field.append(caption, rendered.element, actions)
    return {
      field,
      caption,
      actions,
      feedback: [],
      kind,
      main: { renderer: renderer as ItemSettingsControlRenderer<ItemSettingsFieldView, never>, control: rendered },
      actionControls: new Map(),
    }
  }

  private updateSlot(mount: SlotMount, declaration: SlotDeclaration, view: ItemSettingsFieldView, updateExisting: boolean) {
    const renderer = mount.kind === 'asset' ? (this.controls.asset ?? nativeAsset) : (this.controls.field ?? nativeField)
    if (mount.main.renderer !== renderer) {
      mount.main.control.dispose()
      const callbacks =
        mount.kind === 'asset'
          ? { onChange: (value: SlotValue | undefined) => this.actions.onChangeValue(declaration.key, value), pickAsset: () => this.pickAsset(declaration.key) }
          : { onChange: (value: SlotValue | undefined) => this.actions.onChangeValue(declaration.key, value) }
      const control = renderer(view, callbacks as never)
      control.element.dataset.slot = declaration.key
      mount.main.control.element.replaceWith(control.element)
      mount.main = { renderer: renderer as ItemSettingsControlRenderer<ItemSettingsFieldView, never>, control }
    } else if (updateExisting) mount.main.control.update(view)
    mount.caption.replaceChildren(...this.caption(view))
    if (view.required) mount.caption.title = this.context.labels.required
    else mount.caption.removeAttribute('title')
    this.updateActions(mount, view)
    for (const node of mount.feedback) node.remove()
    mount.feedback = this.feedback(view)
    mount.field.append(...mount.feedback)
  }

  private updateActions(mount: SlotMount, view: ItemSettingsFieldView) {
    const kinds: ItemSettingsActionKind[] = []
    if (view.canDesignOnly) kinds.push('design-only')
    if (view.canOverride) kinds.push('override')
    if (view.canUseSource) kinds.push('use-source')
    const retained = new Set(kinds)
    for (const [index, action] of kinds.entries()) {
      const actionView: ItemSettingsActionView = { ...view, action }
      const renderer = this.controls.action ?? nativeAction
      let mounted = mount.actionControls.get(action)
      if (!mounted || mounted.renderer !== renderer) {
        mounted?.control.dispose()
        const control = renderer(actionView, { onActivate: (enabled) => this.activate(view.key, action, enabled) })
        control.element.dataset.slot = view.key
        control.element.dataset.action = action
        if (mounted) mounted.control.element.replaceWith(control.element)
        else mount.actions.append(control.element)
        mounted = { renderer: renderer as ItemSettingsControlRenderer<ItemSettingsActionView, never>, control }
        mount.actionControls.set(action, mounted)
      } else mounted.control.update(actionView)
      if (mount.actions.children[index] !== mounted.control.element) mount.actions.insertBefore(mounted.control.element, mount.actions.children[index] ?? null)
    }
    for (const [kind, mounted] of mount.actionControls)
      if (!retained.has(kind)) {
        mounted.control.dispose()
        mounted.control.element.remove()
        mount.actionControls.delete(kind)
      }
  }

  private activate(key: string, action: ItemSettingsActionKind, enabled?: boolean) {
    if (action === 'override') this.actions.onOverride(key)
    else if (action === 'use-source') this.actions.onUseSource(key)
    else this.actions.onDesignOnly?.(key, enabled ?? false)
  }
  private async pickAsset(key: string) {
    const declaration = this.context.declarations.find((slot) => slot.key === key)
    if (!declaration) return
    const value = await this.actions.pickAsset?.(declaration)
    if (value !== undefined) this.actions.onChangeValue(key, value)
  }
  private caption(view: SlotFieldView): HTMLElement[] {
    const nodes = [isolated(view.label)]
    if (view.required) {
      const marker = document.createElement('span')
      marker.part.add('required')
      marker.setAttribute('aria-hidden', 'true')
      marker.textContent = '*'
      nodes.push(marker)
    }
    return nodes
  }
  private feedback(view: SlotFieldView): HTMLElement[] {
    const nodes: HTMLElement[] = []
    if (view.state) {
      const state = document.createElement('p')
      state.part.add('state')
      state.dataset.state = view.state
      state.append(isolated(this.context.labels[SLOT_STATE_LABEL_KEYS[view.state]]))
      nodes.push(state)
    }
    for (const warning of view.warnings) {
      const note = document.createElement('p')
      note.part.add('warning')
      note.dataset.warning = warning
      note.append(isolated(this.context.labels[warning]))
      nodes.push(note)
    }
    return nodes
  }
  private disposeSlot(mount: SlotMount) {
    mount.main.control.dispose()
    for (const action of mount.actionControls.values()) action.control.dispose()
  }
}

export function renderFields(
  container: HTMLElement,
  context: ItemSettingsSectionContext,
  actions: FieldsActions,
  controls?: ItemSettingsControls,
): FieldsPanel {
  const panel = new FieldsPanel(container)
  panel.update(context, actions, controls)
  return panel
}
function isolated(text: string): HTMLElement {
  const bdi = document.createElement('bdi')
  bdi.textContent = text
  return bdi
}
