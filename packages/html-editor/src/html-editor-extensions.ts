import { HTML_PROFILE_DIRECTIONS, HTML_PROFILE_MAPPING, type HtmlProfile, type HtmlProfileBlock, type HtmlProfileMark } from '@segnavia/html'
import { type AnyExtension, type Attribute, Extension, getExtensionField } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HTML_ATOM_NAME, type HtmlAtomOptions, htmlAtom } from './html-editor-atom.ts'

const STRUCTURAL_EXTENSIONS = new Set(['doc', 'text', 'undoRedo'])

const TIPTAP_NAME_BY_PROFILE = { atoms: HTML_ATOM_NAME } as const

const TIPTAP_NAME_BY_TAG = {
  p: 'paragraph',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  ul: 'bulletList',
  ol: 'orderedList',
  li: 'listItem',
  hr: 'horizontalRule',
  strong: 'bold',
  em: 'italic',
  u: 'underline',
  a: 'link',
} as const

const BLOCK_CONTRACT_NAMES: Partial<Record<HtmlProfileBlock, readonly string[]>> = {
  ul: ['paragraph'],
  ol: ['paragraph'],
}

function tiptapNames(tags: readonly string[]): string[] {
  return tags.map((tag) => TIPTAP_NAME_BY_TAG[tag as keyof typeof TIPTAP_NAME_BY_TAG])
}

function profileEditorNames(profile: HtmlProfile): { admitted: Set<string>; blocks: string[] } {
  const admitted = new Set(STRUCTURAL_EXTENSIONS)
  const blocks = new Set<string>()
  for (const block of Object.keys(HTML_PROFILE_MAPPING.blocks) as HtmlProfileBlock[]) {
    if (profile.blocks[block] === undefined) continue
    for (const name of tiptapNames(HTML_PROFILE_MAPPING.blocks[block].tags)) {
      admitted.add(name)
      blocks.add(name)
    }
    for (const name of BLOCK_CONTRACT_NAMES[block] ?? []) admitted.add(name)
  }
  for (const mark of profile.marks as HtmlProfileMark[]) {
    for (const name of tiptapNames(HTML_PROFILE_MAPPING.marks[mark].tags)) admitted.add(name)
  }
  if (profile.atoms) admitted.add(TIPTAP_NAME_BY_PROFILE.atoms)
  return { admitted, blocks: [...blocks] }
}

function profileAttributes(profile: HtmlProfile): AnyExtension | undefined {
  const types = profileEditorNames(profile).blocks
  if (types.length === 0 || (!profile.direction && !profile.align?.length)) return undefined
  return Extension.create({
    name: 'htmlProfileAttributes',
    addGlobalAttributes() {
      const attributes: Record<string, Attribute> = {}
      if (profile.direction) {
        attributes.dir = {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute(HTML_PROFILE_MAPPING.direction.attribute)?.toLowerCase()
            return value && HTML_PROFILE_DIRECTIONS.includes(value as (typeof HTML_PROFILE_DIRECTIONS)[number]) ? value : null
          },
          renderHTML: (attrs: Record<string, unknown>) => (attrs.dir ? { [HTML_PROFILE_MAPPING.direction.attribute]: attrs.dir } : {}),
        }
      }
      if (profile.align?.length) {
        attributes.textAlign = {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = element.style.getPropertyValue(HTML_PROFILE_MAPPING.align.property)
            return profile.align?.includes(value as NonNullable<HtmlProfile['align']>[number]) ? value : null
          },
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs.textAlign ? { [HTML_PROFILE_MAPPING.align.attribute]: `${HTML_PROFILE_MAPPING.align.property}:${String(attrs.textAlign)}` } : {},
        }
      }
      return [{ types, attributes }]
    },
  })
}

export function htmlEditorExtensions(profile: HtmlProfile, atomOptions?: HtmlAtomOptions): AnyExtension[] {
  const schemes = profile.links?.schemes ?? []
  const starter = StarterKit.configure({
    trailingNode: false,
    link: {
      openOnClick: false,
      protocols: schemes,
      isAllowedUri: (href) => {
        try {
          return schemes.includes(new URL(href).protocol.replace(/:$/, '') as (typeof schemes)[number])
        } catch {
          return false
        }
      },
    },
  })
  const children = getExtensionField(starter, 'addExtensions', {
    name: starter.name,
    options: starter.options,
    storage: starter.storage,
  })?.() as AnyExtension[] | undefined
  const admitted = profileEditorNames(profile).admitted
  const extensions = (children ?? []).filter((extension) => admitted.has(extension.name))
  if (profile.atoms && atomOptions) extensions.push(htmlAtom(atomOptions))
  const heading = extensions.findIndex((extension) => extension.name === 'heading')
  const headingExtension = extensions[heading]
  if (headingExtension) extensions[heading] = headingExtension.configure({ levels: profile.blocks.h })
  const attributes = profileAttributes(profile)
  if (attributes) extensions.push(attributes)
  return extensions
}

export function htmlEditorBlockTypes(profile: HtmlProfile): string[] {
  return profileEditorNames(profile).blocks
}
