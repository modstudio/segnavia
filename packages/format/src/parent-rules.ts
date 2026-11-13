import { z } from 'zod'
import { closedObject } from './closed-object.ts'

export const ParentRuleWhen = closedObject({
  position: z.enum(['documentFirst', 'documentLast', 'sectionFirst', 'sectionLast']).optional(),
  face: z.enum(['recto', 'verso']).optional(),
  blank: z.boolean().optional(),
}).refine((when) => when.position !== undefined || when.face !== undefined || when.blank !== undefined, {
  message: 'a parent rule when states no condition; state a position, face or blank condition, or remove when to clear this refusal',
})

export const ParentRule = closedObject({
  when: ParentRuleWhen.optional(),
  parent: z.string().min(1),
})
export type ParentRule = z.infer<typeof ParentRule>

export const parentRules = z
  .array(ParentRule)
  .min(1, 'parentRules needs a default rule; add an unconditional last rule to clear this refusal')
  .superRefine((rules, ctx) => {
    const defaultIndex = rules.findIndex((rule) => rule.when === undefined)
    if (defaultIndex < 0) {
      ctx.addIssue({ code: 'custom', message: 'parentRules needs a default rule; add an unconditional last rule to clear this refusal' })
    } else if (defaultIndex !== rules.length - 1) {
      ctx.addIssue({
        code: 'custom',
        path: [defaultIndex, 'when'],
        message: 'the default parent rule is not last; move the unconditional rule to the end to clear this refusal',
      })
    }
  })

export type ParentRules = z.infer<typeof parentRules>

export const BOOK_PARENT_NAMES = {
  recto: 'segnavia:recto',
  verso: 'segnavia:verso',
  opener: 'segnavia:opener',
  blank: 'segnavia:blank',
} as const

export const FLOWING_PARENT_RULES: ParentRules = [
  { when: { blank: true }, parent: BOOK_PARENT_NAMES.blank },
  { when: { position: 'sectionFirst' }, parent: BOOK_PARENT_NAMES.opener },
  { when: { face: 'verso' }, parent: BOOK_PARENT_NAMES.verso },
  { parent: BOOK_PARENT_NAMES.recto },
]

export const TEMPLATED_PARENT_RULES: ParentRules = [
  { when: { blank: true }, parent: BOOK_PARENT_NAMES.blank },
  { when: { face: 'verso' }, parent: BOOK_PARENT_NAMES.verso },
  { parent: BOOK_PARENT_NAMES.recto },
]

export const DESIGNED_PARENT_RULES: ParentRules = [{ parent: BOOK_PARENT_NAMES.blank }]

export function defaultParentRules(kind: string, role?: 'body' | 'fixed'): ParentRules {
  if (kind === 'fixed' && role !== 'body') return DESIGNED_PARENT_RULES
  if (kind === 'fixed') return TEMPLATED_PARENT_RULES
  return FLOWING_PARENT_RULES
}

export function effectiveParentRules(sectionRules: ParentRules | undefined, bookRules: ParentRules | undefined, fallback: ParentRules): ParentRules {
  return sectionRules ?? bookRules ?? fallback
}

export function textHoldingParentRules(rules: ParentRules): ParentRules {
  return rules.filter((rule) => rule.when?.blank !== true)
}

export function renamedParentRulesFieldIssue(field: string, path: (string | number)[]): { path: (string | number)[]; message: string } {
  return { path, message: `${field} was renamed; use parentRules instead to clear this refusal` }
}

export function parentRuleIssues(
  rules: ParentRules,
  known: ReadonlySet<string>,
  path: (string | number)[] = ['parentRules'],
): Array<{ path: (string | number)[]; message: string }> {
  return rules.flatMap((rule, index) =>
    known.has(rule.parent)
      ? []
      : [
          {
            path: [...path, index, 'parent'],
            message: `parent rule names unknown parent page "${rule.parent}"; add that parent page or name an existing one to clear this refusal`,
          },
        ],
  )
}
