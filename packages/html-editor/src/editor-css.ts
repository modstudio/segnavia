export const EDITOR_CSS = `
:where(:host(segnavia-html-editor:not([unstyled]))){display:block}
:where(:host(segnavia-html-editor:not([unstyled])) [part~="editor"]){min-inline-size:0;min-block-size:0;overflow:auto}
:where(:host(segnavia-html-editor:not([unstyled])) [part~="editor"] .ProseMirror){min-block-size:100%;outline:0}
`
