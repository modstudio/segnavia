// HTTP keeps the renderer document non-secure while giving it a routable origin.
export const RENDER_DOCUMENT_URL = 'http://segnavia.invalid/'

// Chromium titles the PDF of an untitled document with its URL's host; the PDF writer removes that placeholder.
export const RENDER_PLACEHOLDER_TITLE = new URL(RENDER_DOCUMENT_URL).host

// Every capability except same-origin keeps the document opaque, without cookies or storage, while preserving its authored behavior.
export const RENDER_DOCUMENT_SANDBOX =
  'allow-downloads allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts allow-storage-access-by-user-activation allow-top-navigation allow-top-navigation-by-user-activation allow-top-navigation-to-custom-protocols'
