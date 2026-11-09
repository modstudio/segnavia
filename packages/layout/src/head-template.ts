import { type Direction, type HeadTemplate, resolveDirection } from '@segnavia/format'

export function escapeHeadTemplateHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function resolveHeadTemplate(
  template: HeadTemplate,
  variables: Readonly<Record<string, string>>,
  recordSlots: Readonly<Record<string, string | undefined>>,
  direction?: Direction,
  lang?: string,
): string {
  const values = template.parts.map((part) => ('variable' in part ? (variables[part.variable] ?? '') : (recordSlots[part.record] ?? '')))
  const kept: string[] = []
  for (const value of values) {
    if (template.dropEmpty && value === '') continue
    if (template.collapseEqual && value === kept.at(-1)) continue
    kept.push(value)
  }
  const templateDirection = resolveDirection(template.dir ?? direction, lang, template.separator)
  const separator = `<span dir="${templateDirection}">${escapeHeadTemplateHtml(template.separator)}</span>`
  return kept.map((value) => `<bdi dir="${resolveDirection(undefined, lang, value)}">${escapeHeadTemplateHtml(value)}</bdi>`).join(separator)
}

export function headTemplateScript(): string {
  return `var escapeHeadTemplateHtml=${escapeHeadTemplateHtml.toString()};var resolveHeadTemplate=${resolveHeadTemplate.toString()};`
}
