import { HTML_PROFILE_MAPPING, type HtmlProfile } from '@segnavia/html'
import { type AnyExtension, type Attribute, Extension, getExtensionField } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

const STRUCTURAL_EXTENSIONS = new Set(['doc', 'text', 'undoRedo'])

function admittedNames(profile: HtmlProfile): Set<string> {
  const names = new Set(STRUCTURAL_EXTENSIONS)
  if (profile.blocks.p || profile.blocks.ul || profile.blocks.ol) names.add('paragraph')
  if (profile.blocks.h) names.add('heading')
  if (profile.blocks.ul) names.add('bulletList')
  if (profile.blocks.ol) names.add('orderedList')
  if (profile.blocks.ul || profile.blocks.ol) names.add('listItem')
  if (profile.blocks.hr) names.add('horizontalRule')
  for (const mark of profile.marks) names.add(mark)
  return names
}

function blockTypes(profile: HtmlProfile): string[] {
  const types: string[] = []
  if (profile.blocks.p) types.push('paragraph')
  if (profile.blocks.h) types.push('heading')
  if (profile.blocks.ul) types.push('bulletList', 'listItem')
  if (profile.blocks.ol) types.push('orderedList', 'listItem')
  return [...new Set(types)]
}

function profileAttributes(profile: HtmlProfile): AnyExtension | undefined {
  const types = blockTypes(profile)
  if (types.length === 0 || (!profile.direction && !profile.align?.length)) return undefined
  return Extension.create({
    name: 'htmlProfileAttributes',
    addGlobalAttributes() {
      const attributes: Record<string, Attribute> = {}
      if (profile.direction) {
        attributes.dir = {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute(HTML_PROFILE_MAPPING.direction.attribute),
          renderHTML: (attrs: Record<string, unknown>) => (attrs.dir ? { [HTML_PROFILE_MAPPING.direction.attribute]: attrs.dir } : {}),
        }
      }
      if (profile.align?.length) {
        attributes.textAlign = {
          default: null,
          parseHTML: (element: HTMLElement) => element.style[HTML_PROFILE_MAPPING.align.property] || null,
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.textAlign ? { [HTML_PROFILE_MAPPING.align.attribute]: `${HTML_PROFILE_MAPPING.align.property}:${String(attrs.textAlign)}` } : {},
        }
      }
      return [{ types, attributes }]
    },
  })
}

export function htmlEditorExtensions(profile: HtmlProfile): AnyExtension[] {
  const starter = StarterKit.configure({ trailingNode: false, link: { openOnClick: false } })
  const children = getExtensionField(starter, 'addExtensions', {
    name: starter.name,
    options: starter.options,
    storage: starter.storage,
  })?.() as AnyExtension[] | undefined
  const admitted = admittedNames(profile)
  const extensions = (children ?? []).filter((extension) => admitted.has(extension.name))
  const heading = extensions.findIndex((extension) => extension.name === 'heading')
  const headingExtension = extensions[heading]
  if (headingExtension) extensions[heading] = headingExtension.configure({ levels: profile.blocks.h })
  const attributes = profileAttributes(profile)
  if (attributes) extensions.push(attributes)
  return extensions
}

export function htmlEditorBlockTypes(profile: HtmlProfile): string[] {
  return blockTypes(profile)
}
