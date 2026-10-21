import {
  CUSTOM_PAPER_MAX_MM,
  CUSTOM_PAPER_MIN_MM,
  NAMED_PAPERS,
  PAPER_GROUPS,
  PAPER_METADATA,
  Paper,
  type PaperGroup,
  type PaperUnit,
  type PrintSetting,
  PrintSettingInput,
  toMillimeters,
} from '@segnavia/format'
import { TOKENS_CSS } from './controls-style.ts'

const CUSTOM_VALUE = 'custom'

export interface PaperPickerLabels {
  paper: string
  customPaper: string
  width: string
  height: string
  unit: string
  orientation: string
  portrait: string
  landscape: string
  invalidSize: string
  groups: Record<PaperGroup, string>
  paperNames: Record<(typeof NAMED_PAPERS)[number], string>
  paperSizes: Record<(typeof NAMED_PAPERS)[number], string>
}

export const ENGLISH_PAPER_PICKER_LABELS: PaperPickerLabels = {
  paper: 'Paper',
  customPaper: 'Custom size…',
  width: 'Width',
  height: 'Height',
  unit: 'Unit',
  orientation: 'Orientation',
  portrait: 'Portrait',
  landscape: 'Landscape',
  invalidSize: `Each side must be between ${CUSTOM_PAPER_MIN_MM} mm and ${CUSTOM_PAPER_MAX_MM} mm.`,
  groups: Object.fromEntries(PAPER_GROUPS.map((group) => [group, group])) as Record<PaperGroup, string>,
  paperNames: Object.fromEntries(NAMED_PAPERS.map((paper) => [paper, PAPER_METADATA[paper].name])) as PaperPickerLabels['paperNames'],
  paperSizes: Object.fromEntries(NAMED_PAPERS.map((paper) => [paper, PAPER_METADATA[paper].size])) as PaperPickerLabels['paperSizes'],
}

export type PaperPickerLabelOverrides = Partial<Omit<PaperPickerLabels, 'groups' | 'paperNames' | 'paperSizes'>> & {
  groups?: Partial<PaperPickerLabels['groups']>
  paperNames?: Partial<PaperPickerLabels['paperNames']>
  paperSizes?: Partial<PaperPickerLabels['paperSizes']>
}

function pickerLabels(overrides: PaperPickerLabelOverrides): PaperPickerLabels {
  return {
    ...ENGLISH_PAPER_PICKER_LABELS,
    ...overrides,
    groups: { ...ENGLISH_PAPER_PICKER_LABELS.groups, ...overrides.groups },
    paperNames: { ...ENGLISH_PAPER_PICKER_LABELS.paperNames, ...overrides.paperNames },
    paperSizes: { ...ENGLISH_PAPER_PICKER_LABELS.paperSizes, ...overrides.paperSizes },
  }
}

function inUnit(millimeters: number, unit: PaperUnit): number {
  const divisor = unit === 'in' ? 25.4 : unit === 'pt' ? 25.4 / 72 : 1
  return Math.round((millimeters / divisor) * 10000) / 10000
}

export class SegnaviaPaperPicker extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' })
  private setting: PrintSetting = { paper: 'a4', orientation: 'portrait' }
  private custom: Extract<PrintSetting['paper'], object> = { width: 210, height: 297, unit: 'mm' }
  private words = ENGLISH_PAPER_PICKER_LABELS
  private drawn = false

  get value(): PrintSetting {
    return this.setting
  }

  set value(value: PrintSetting) {
    this.setting = PrintSettingInput.parse(value)
    if (typeof this.setting.paper !== 'string') this.custom = this.setting.paper
    this.render()
  }

  get labels(): PaperPickerLabels {
    return this.words
  }

  set labels(value: PaperPickerLabelOverrides) {
    this.words = pickerLabels(value)
    this.render()
  }

  connectedCallback() {
    if (!this.drawn) {
      this.root.innerHTML = `<style>${TOKENS_CSS}${PICKER_CSS}</style><div class="picker">
        <label class="paper"><span></span><select></select></label>
        <div class="custom">
          <label><span data-label="width"></span><input name="width" type="number" step="any"></label>
          <label><span data-label="height"></span><input name="height" type="number" step="any"></label>
          <label><span data-label="unit"></span><select name="unit"><option value="mm">mm</option><option value="in">in</option><option value="pt">pt</option></select></label>
        </div>
        <fieldset><legend></legend><div class="orientation"><button type="button" value="portrait"></button><button type="button" value="landscape"></button></div></fieldset>
      </div>`
      this.root.addEventListener('change', this.changed)
      this.root.addEventListener('click', this.clicked)
      this.drawn = true
    }
    this.render()
  }

  private changed = (event: Event) => {
    event.stopPropagation()
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return
    if (target.matches('.paper select')) {
      const paper = target.value
      this.setting = { ...this.setting, paper: paper === CUSTOM_VALUE ? this.custom : Paper.parse(paper) }
      this.render()
      this.emit()
      return
    }
    if (target.name === 'unit') {
      const unit = target.value as PaperUnit
      this.custom = {
        width: inUnit(toMillimeters(this.custom.width, this.custom.unit), unit),
        height: inUnit(toMillimeters(this.custom.height, this.custom.unit), unit),
        unit,
      }
      this.setting = { ...this.setting, paper: this.custom }
      this.render()
      this.emit()
      return
    }
    if (target instanceof HTMLInputElement && (target.name === 'width' || target.name === 'height')) {
      this.changeSide(target.name, target.valueAsNumber, target)
    }
  }

  private clicked = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLButtonElement) || !target.closest('.orientation')) return
    this.setting = { ...this.setting, orientation: target.value as PrintSetting['orientation'] }
    this.renderOrientation()
    this.emit()
  }

  private changeSide(side: 'width' | 'height', value: number, input: HTMLInputElement) {
    const candidate = { ...this.custom, [side]: value }
    const result = Paper.safeParse(candidate)
    input.setCustomValidity(result.success ? '' : this.words.invalidSize)
    if (!result.success) {
      input.reportValidity()
      return
    }
    this.custom = candidate
    this.setting = { ...this.setting, paper: candidate }
    this.emit()
  }

  private emit() {
    this.dispatchEvent(new CustomEvent<PrintSetting>('change', { detail: this.setting, bubbles: true, composed: true }))
  }

  private render() {
    if (!this.drawn) return
    const paperSelect = this.root.querySelector('.paper select') as HTMLSelectElement
    ;(this.root.querySelector('.paper span') as HTMLElement).textContent = this.words.paper
    paperSelect.replaceChildren(
      ...PAPER_GROUPS.map((group) => {
        const options = NAMED_PAPERS.filter((paper) => PAPER_METADATA[paper].group === group).map(
          (paper) => new Option(`${this.words.paperNames[paper]} — ${this.words.paperSizes[paper]}`, paper),
        )
        const element = document.createElement('optgroup')
        element.label = this.words.groups[group]
        element.append(...options)
        return element
      }),
      new Option(this.words.customPaper, CUSTOM_VALUE),
    )
    paperSelect.value = typeof this.setting.paper === 'string' ? this.setting.paper : CUSTOM_VALUE
    const custom = this.root.querySelector('.custom') as HTMLElement
    custom.hidden = typeof this.setting.paper === 'string'
    for (const side of ['width', 'height'] as const) {
      ;(this.root.querySelector(`[data-label="${side}"]`) as HTMLElement).textContent = this.words[side]
      const input = this.root.querySelector(`input[name="${side}"]`) as HTMLInputElement
      input.valueAsNumber = this.custom[side]
      input.min = String(inUnit(CUSTOM_PAPER_MIN_MM, this.custom.unit))
      input.max = String(inUnit(CUSTOM_PAPER_MAX_MM, this.custom.unit))
      input.setCustomValidity('')
    }
    ;(this.root.querySelector('[data-label="unit"]') as HTMLElement).textContent = this.words.unit
    ;(this.root.querySelector('select[name="unit"]') as HTMLSelectElement).value = this.custom.unit
    ;(this.root.querySelector('legend') as HTMLElement).textContent = this.words.orientation
    this.renderOrientation()
  }

  private renderOrientation() {
    if (!this.drawn) return
    for (const orientation of ['portrait', 'landscape'] as const) {
      const button = this.root.querySelector(`button[value="${orientation}"]`) as HTMLButtonElement
      button.textContent = this.words[orientation]
      button.setAttribute('aria-pressed', String(this.setting.orientation === orientation))
    }
  }
}

const PICKER_CSS = `
:host{display:block;max-inline-size:36rem}
*{box-sizing:border-box}
.picker{display:grid;gap:14px}
label{display:grid;gap:6px;font-size:13px;color:var(--_muted)}
select,input,button{font:inherit;color:var(--_ink);background:var(--_surface);border:1px solid var(--_line);border-radius:8px}
select,input{inline-size:100%;min-block-size:38px;padding-block:7px;padding-inline:10px}
select:focus-visible,input:focus-visible,button:focus-visible{outline:2px solid var(--_accent);outline-offset:1px}
.custom{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(5rem,.5fr);gap:10px}
.custom[hidden]{display:none}
fieldset{min-inline-size:0;margin:0;padding:0;border:0}
legend{margin-block-end:6px;color:var(--_muted);font-size:13px}
.orientation{display:inline-grid;grid-template-columns:1fr 1fr;padding:3px;border:1px solid var(--_line);border-radius:10px;background:var(--_surface)}
button{min-block-size:34px;padding-inline:16px;border-color:transparent;cursor:pointer}
button[aria-pressed="true"]{color:var(--_accent-ink);background:var(--_accent)}
@media(max-width:360px){.custom{grid-template-columns:1fr 1fr}.custom label:last-child{grid-column:1/-1}}
`
