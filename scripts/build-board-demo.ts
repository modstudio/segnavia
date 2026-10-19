import { writeFileSync } from 'node:fs'
import path from 'node:path'

export async function buildBoardDemo(site: string, image: string, shot: string) {
  const editingBundle = await Bun.build({
    entrypoints: [path.join(import.meta.dir, '../packages/frame/src/board-editing.ts')],
    target: 'browser',
    format: 'esm',
    minify: true,
  })
  if (!editingBundle.success || !editingBundle.outputs[0]) throw new Error('building the board editing demo bundle failed')
  writeFileSync(path.join(site, 'segnavia-board-editing.js'), await editingBundle.outputs[0].text())
  writeFileSync(path.join(site, 'board-script.html'), `<!doctype html><script>parent.postMessage('board-script-ran', '*')</script><p>Board URL slide</p>`)
  writeFileSync(
    path.join(site, 'board.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;height:100%;font-family:system-ui}body{display:grid;grid-template-columns:auto minmax(0,1fr)}main{grid-column:2;position:relative;min-inline-size:0}.editing{position:absolute;inset-block-end:16px;inset-inline-end:16px;z-index:6;display:flex;gap:6px;align-items:center}segnavia-board-list{grid-column:1;box-sizing:border-box;inline-size:280px;padding:16px;overflow:auto}segnavia-board-list::part(search){padding:8px;margin-block-end:12px}segnavia-board-list::part(group-title),segnavia-board-list::part(item){padding:7px;border:0;gap:6px}segnavia-board{display:block;inline-size:100%;block-size:100%;--segnavia-board-background:#ebebef;--segnavia-board-placeholder:#dcdce1;--segnavia-board-section:#c9c9d1;--segnavia-board-section-fill:#e1e1e7;--segnavia-board-item-title:#86868f;--segnavia-board-section-title:#1d1d22;--segnavia-board-selection-color:#6d28d9}segnavia-board::part(item){box-shadow:0 1px 3px #0002;background:white}segnavia-board::part(item-title){font-size:13px;padding-block-end:6px;gap:5px}segnavia-board::part(item-actions){gap:3px}segnavia-board::part(item-action){border:0;border-radius:4px;padding:2px 5px}segnavia-board::part(section){border-radius:12px}segnavia-board::part(section-title){font-size:14px;font-weight:500;padding:5px 12px;margin-block-end:8px;border:1px solid #9d9da6;border-radius:7px;background:#e1e1e7}segnavia-board::part(label){font-weight:600}segnavia-board-toolbar{position:absolute;inset-block-start:16px;inset-inline-end:16px;z-index:3}segnavia-board-toolbar::part(toolbar){gap:4px;padding:4px;border:1px solid #c9c9d1;border-radius:8px;box-shadow:0 2px 8px #0002}segnavia-board-toolbar::part(list),segnavia-board-toolbar::part(zoom-out),segnavia-board-toolbar::part(zoom-level),segnavia-board-toolbar::part(zoom-in),segnavia-board-toolbar::part(fit),segnavia-board-toolbar::part(share){min-block-size:32px;border:0;border-radius:5px;padding-inline:9px}</style></head>
    <body><segnavia-board-list id="list" for="board"></segnavia-board-list><main><segnavia-board id="board"></segnavia-board><segnavia-board-toolbar for="board" list-for="list" shareable><span slot="icon-list">☰</span><span slot="icon-zoom-out">−</span><span slot="icon-zoom-in">+</span><span slot="icon-fit">⤢</span><span slot="icon-share">Share</span></segnavia-board-toolbar><div class="editing"><label><input id="reject-change" type="checkbox">Reject the next change</label><button id="add-deck">Add a deck</button><button id="undo" disabled>Undo</button><button id="redo" disabled>Redo</button></div></main><script type="module" src="segnavia.js"></script><script type="module">
      import {attachBoardEditing} from './segnavia-board-editing.js'
      await customElements.whenDefined('segnavia-board')
      const board = document.getElementById('board')
      const toolbar = document.querySelector('segnavia-board-toolbar')
      toolbar.addEventListener('segnavia-board-share', event => console.log('segnavia-board-share', event.detail))
      window.boardActions = []
      window.boardSelections = []
      board.addEventListener('segnavia-board-item-action', event => { window.boardActions.push(event.detail); console.log('segnavia-board-item-action', event.detail) })
      board.addEventListener('segnavia-board-selection', event => { window.boardSelections.push(event.detail); console.log('segnavia-board-selection', event.detail) })
      const kindGlyphs = {deck:'▣',page:'▤',paper:'▥',book:'▦',image:'▧',shot:'◫'}
      board.kindIcon = kind => { const icon=document.createElement('span'); icon.dataset.kindIcon=kind; icon.textContent=kindGlyphs[kind]; return icon }
      board.itemActions = [
        {id:'open',label:'Open',icon:()=>document.createTextNode('↗')},
        {id:'download',label:'Download',kinds:['deck','page'],icon:()=>document.createTextNode('↓')},
      ]
      const [deck, hebrew, responsive] = await Promise.all(['deck.json','deck-he.json','responsive-deck.json'].map(src => fetch(src).then(response => response.json())))
      const page = {html:'<main style="font:32px system-ui;padding:36px"><h1>Board page</h1><p>A local fixed page.</p></main>',size:{width:640,height:900},scripts:'refuse'}
      const paperPages = [{html:'<main style="font:32px system-ui;padding:36px"><h1>Paper</h1></main>',size:{width:600,height:800},scripts:'refuse'}]
      const imposition = {paper:'letter',orientation:'portrait',columns:1,rows:1,cell:{width:215.9,height:279.4}}
      const urlDeck = {title:'URL deck',size:{width:1280,height:720},layout:'fixed',fit:'contain',frame:false,scripts:'refuse',slides:[{id:'url',content:{kind:'url',src:'board-script.html'}}]}
      const reviewItems = [
        {id:'deck-url',kind:'deck',address:'url',x:1400,y:0,width:320},
        {id:'paper-empty',kind:'paper',address:'empty',x:3000,y:0,width:320},
      ]
      const items = [
        {id:'deck-small',kind:'deck',address:'deck',x:0,y:0,width:220},
        {id:'deck-hebrew',kind:'deck',address:'hebrew',x:300,y:0,width:320},
        {id:'page',kind:'page',address:'page',x:700,y:0,width:180},
        {id:'paper',kind:'paper',address:'paper',x:930,y:0,width:180},
        {id:'image',kind:'image',address:'image',x:0,y:300,width:260},
        {id:'shot',kind:'shot',address:'shot',x:340,y:300,width:260},
        {id:'deck-far',kind:'deck',address:'responsive',x:5000,y:100,width:320},
      ]
      const common = {title:'Board demo',direction:'ltr',labels:[{id:'label',text:'Local assets',x:0,y:-105},{id:'label-he',text:'אוסף מקומי',x:700,y:-70}],sections:[{id:'section',title:'Two decks',rectangle:{x:-24,y:-56,width:668,height:236},items:['deck-small','deck-hebrew']}]}
      const values = {
        deck:{kind:'deck',deck,title:'Creating a class'}, hebrew:{kind:'deck',deck:hebrew,title:'מצגת'}, responsive:{kind:'deck',deck:responsive,title:'Responsive deck'}, url:{kind:'deck',deck:urlDeck,title:'URL deck'},
        page:{kind:'page',page,size:{width:640,height:900},title:'Page'}, paper:{kind:'paper',pages:paperPages,imposition,size:{width:816,height:1056},title:'Paper'},
        empty:{kind:'paper',pages:[],imposition,size:{width:816,height:1056},title:'Empty paper'},
        image:{kind:'image',src:${JSON.stringify(image)},width:1280,height:720,title:'Image'}, shot:{kind:'shot',src:${JSON.stringify(shot)},width:1280,height:720,title:'Shot'},
      }
      window.boardErrors = []
      window.boardUnhandled = []
      window.boardScriptRan = false
      window.addEventListener('message', event => { if (event.data === 'board-script-ran') window.boardScriptRan = true })
      window.addEventListener('unhandledrejection', event => { window.boardUnhandled.push(String(event.reason)) })
      board.addEventListener('segnavia-board-error', event => { window.boardErrors.push(event.detail) })
      board.resolveItem = item => new Promise(resolve => setTimeout(() => resolve(values[item.address]), 150))
      const names = {'deck-small':'Creating a class','deck-hebrew':'מַצֶּגֶת','page':'A page with a deliberately long title that truncates','paper':'Paper','image':'Image','shot':'Shot','deck-far':'Far away deck','deck-url':'URL deck','paper-empty':'Empty paper'}
      window.itemNamesCalls = 0
      board.itemNames = async items => { window.itemNamesCalls += 1; return Object.fromEntries(items.map(item => [item.id,names[item.id]])) }
      board.board = {...common,items:items.slice(0,-1)}
      await new Promise(requestAnimationFrame)
      window.initialItemNamesCalls = window.itemNamesCalls
      board.board = {...common,items}
      window.boardChanges = []
      window.boardEditErrors = []
      window.hostBoard = board.board
      const editing = attachBoardEditing(board,{change:change=>new Promise((resolve,reject)=>setTimeout(()=>{window.boardChanges.push(change);if(document.getElementById('reject-change').checked){document.getElementById('reject-change').checked=false;reject(new Error('Demo change rejected'))}else{window.hostBoard=change.board;resolve()}},100))})
      board.addEventListener('segnavia-board-edit-error',event=>{window.boardEditErrors.push(event.detail);console.log('segnavia-board-edit-error',event.detail)})
      board.addEventListener('segnavia-board-history',event=>{document.getElementById('undo').disabled=!event.detail.canUndo;document.getElementById('redo').disabled=!event.detail.canRedo})
      document.getElementById('add-deck').addEventListener('click',()=>editing.add({kind:'deck',address:'demo-added-deck'}))
      document.getElementById('undo').addEventListener('click',()=>editing.undo())
      document.getElementById('redo').addEventListener('click',()=>editing.redo())
      window.boardEditing = editing
      const list = document.querySelector('segnavia-board-list')
      list.searchItems = (query,signal) => new Promise((resolve,reject) => { const timer=setTimeout(() => resolve(query.toLowerCase().includes('content') ? ['deck-far'] : []),80); signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true}) })
      board.addEventListener('segnavia-board-open', event => { window.openedItem = event.detail.item })
      window.addBoardReviewItems = () => { board.board = {...board.board,items:[...board.board.items,...reviewItems]} }
      window.demoBoard = board
    </script></body></html>`,
  )
}
