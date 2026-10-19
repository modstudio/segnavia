export const HEADLESS_ELEMENTS = {
  stage: 'segnavia-stage',
  thumbnail: 'segnavia-thumbnail',
  board: 'segnavia-board',
  boardList: 'segnavia-board-list',
  boardToolbar: 'segnavia-board-toolbar',
  page: 'segnavia-page',
  paper: 'segnavia-paper',
  book: 'segnavia-book',
} as const

export const HEADLESS_ELEMENT_NAMES = Object.values(HEADLESS_ELEMENTS)
