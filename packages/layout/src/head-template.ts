import { type Direction, type HeadTemplate, resolveDirection, textDirection } from '@segnavia/format'

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
  const values = template.parts.map((part) => {
    if ('variable' in part) return Object.hasOwn(variables, part.variable) ? (variables[part.variable] ?? '') : ''
    return Object.hasOwn(recordSlots, part.record) ? (recordSlots[part.record] ?? '') : ''
  })
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

// The frame script carries resolveHeadTemplate with everything it calls. Each function is
// declared under its own, possibly minified, name so the calls inside the others resolve.
export function headTemplateScript(): string {
  return Object.entries({ textDirection, resolveDirection, escapeHeadTemplateHtml, resolveHeadTemplate })
    .map(([name, fn]) => `${fn.toString()}\nvar ${name}=${fn.name};`)
    .join('\n')
}
