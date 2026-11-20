export const HEADLESS_ELEMENTS = {
  stage: 'segnavia-stage',
  thumbnail: 'segnavia-thumbnail',
  board: 'segnavia-board',
  boardList: 'segnavia-board-list',
  boardToolbar: 'segnavia-board-toolbar',
  page: 'segnavia-page',
  printedPages: 'segnavia-printed-pages',
  paper: 'segnavia-paper',
  document: 'segnavia-document',
  book: 'segnavia-book',
  image: 'segnavia-image',
  sound: 'segnavia-sound',
} as const

export const HEADLESS_ELEMENT_NAMES = Object.values(HEADLESS_ELEMENTS)
