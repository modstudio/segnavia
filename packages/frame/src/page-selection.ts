export const PAGE_CHANGED_SELECTION = 'Cannot read the selection because the page changed before it replied. Read the selection from the current page.'

export type SelectionCancellation = (reason: Error) => void
export type PostedSelectionRequest = { cancel?: SelectionCancellation }
