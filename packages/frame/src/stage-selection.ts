import type { Scripts } from '@segnavia/format'
import type { ResolvedContent } from './controller.ts'

export const SLIDE_CHANGED_SELECTION_ERROR = 'Cannot read the selection because the slide changed before it replied. Read the selection from the current slide.'

export function shownScripts(scripts: Scripts, authoringRefusesScripts: boolean): Scripts {
  return authoringRefusesScripts && scripts !== 'refuse' ? 'refuse' : scripts
}

export function stageSelectionRefusal(content: ResolvedContent | null, scripts: Scripts | null, frameMounted: boolean): Error | null {
  if (!content) return new Error('Cannot read the selection because no slide is shown or no frame is mounted. Show a slide before reading its selection.')
  if (content.kind === 'url') {
    if (content.bridge !== true || content.scripts !== 'refuse')
      return new Error(
        'Cannot read the selection from a host-served document. Resolve the slide to a url whose bridge and refused author scripts are declared, and serve it through frameDocument with scripts refused.',
      )
    if (!frameMounted)
      return new Error('Cannot read the selection because no slide is shown or no frame is mounted. Show a slide before reading its selection.')
    return null
  }
  if (content.kind !== 'html')
    return new Error('Cannot read the selection because the current slide has no bridge. Show an HTML slide whose author scripts are refused instead.')
  if (!frameMounted) return new Error('Cannot read the selection because no slide is shown or no frame is mounted. Show a slide before reading its selection.')
  if (scripts !== 'refuse')
    return new Error(
      'Cannot read the selection while author scripts run. A selection is read only from a slide whose author scripts are refused, because an author script could forge the reply.',
    )
  return null
}
