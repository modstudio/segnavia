import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function buildDeckHost(site: string) {
  writeFileSync(
    path.join(site, 'deck-host.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Window deck</title><style>
html,body{margin:0;max-inline-size:100%;overflow-x:hidden;font:16px system-ui,sans-serif}*{box-sizing:border-box}
#deck-root{min-block-size:100vh;background:#eee;--segnavia-backdrop:#121212}.layout{display:grid;grid-template-columns:120px minmax(0,1fr)}
#rail{padding:8px;overflow:auto}.main{min-inline-size:0;padding-inline:12px}segnavia-stage{inline-size:100%;padding-inline:8px}
#controls{block-size:140px;display:flex;align-items:center;gap:8px}textarea{display:block;inline-size:100%;block-size:172px}
[data-presenting] .layout{display:block}[data-presenting] #rail,[data-presenting] textarea{display:none}[data-presenting] .main{padding:0}
</style></head><body><div id="deck-root"><div class="layout"><nav id="rail"></nav><main class="main">
<segnavia-stage id="deck" neighbors fit="viewport"></segnavia-stage><div id="controls"><button id="previous">Previous</button>
<button id="next">Next</button><button id="present">Present</button><output id="counter"></output></div>
<textarea id="notes">Notes stay editable</textarea></main></div></div><script type="module" src="segnavia-controls.js"></script>
<script type="module">
await customElements.whenDefined('segnavia-stage')
const lib = await import('./segnavia.js')
const stage = document.getElementById('deck')
const root = document.getElementById('deck-root')
const makeSlide = (id, suffix='') => ({id,content:{kind:'html',html:'<!doctype html><html><head><style>html{background:rgb(15,118,110)}h1{color:rgb(0, 128, 0)}</style></head><body style="margin:0;height:100vh;display:grid;place-items:center"><h1>'+id+suffix+'</h1><script>document.querySelector("h1").textContent+="-script-ran"<\\/script></body></html>'}})
const makeDeck = (ids, edits={}, scripts='refuse', transition={kind:'none'}, dir) => ({title:'Window deck',scripts,transition,dir,slides:ids.map(id=>makeSlide(id,edits[id]||''))})
let ids = Array.from({length:Number(new URLSearchParams(location.search).get('slides')||40)},(_,index)=>'slide-'+(index+1))
let scripts = 'refuse'
const controller = new lib.DeckController({keys:'page'})
stage.controller = controller
stage.css = 'h1{color:rgb(200, 0, 0)}'
stage.reserve = {blockStart:140,blockEnd:172}
const rail = document.getElementById('rail')
for(let index=0;index<ids.length;index++){const button=document.createElement('button');button.textContent=String(index+1);button.onclick=()=>controller.go(index);rail.append(button)}
document.getElementById('previous').onclick=()=>controller.previous()
document.getElementById('next').onclick=()=>controller.next()
document.getElementById('present').onclick=()=>controller.state.presenting?controller.stopPresenting():controller.present(root)
controller.addEventListener('change',({detail})=>{document.getElementById('counter').textContent=(detail.index+1)+' / '+detail.deck.slides.length;stage.reserve=detail.presenting?{blockStart:140}:{blockStart:140,blockEnd:172}})
const waitForActive=id=>new Promise(resolve=>{const poll=()=>stage.querySelector('[data-active]')?.dataset.slideId===id?resolve():requestAnimationFrame(poll);poll()})
const api={controller,stage,get ids(){return ids},async reload(next,edits={}){ids=next;await controller.load(makeDeck(ids,edits,scripts))},async loadScripts(nextScripts){scripts=nextScripts;await controller.load(makeDeck(ids,{},scripts))},async loadSandboxed(){ids=['sandboxed-1','sandboxed-2','sandboxed-3'];scripts='sandboxed';await controller.load(makeDeck(ids,{},scripts));await controller.go(0)},async loadTransition(kind,nextScripts,dir='ltr'){ids=['transition-1','transition-2','transition-3'];scripts=nextScripts;stage.setAttribute('transition','none');stage.removeAttribute('transition-duration');await controller.load(makeDeck(ids,{},scripts,{kind,duration:300},dir));await controller.go(0);await waitForActive('transition-1');stage.removeAttribute('transition')},async setTransitionOverride(kind,duration){stage.setAttribute('transition',kind);stage.setAttribute('transition-duration',String(duration));await controller.load(makeDeck(ids,{},scripts,{kind:'slide',duration:300}))},async loadHeld(){const shown=controller.state.slide.id;ids=[shown,'held'];scripts='sandboxed';await controller.load({title:'Window deck',scripts,slides:[makeSlide(ids[0]),{id:ids[1],content:{kind:'url',src:'held-frame.html'}}]})},async setCss(css){stage.css=css;await controller.load(makeDeck(ids,{},scripts))},deck:()=>makeDeck(ids,{},scripts)}
Object.defineProperty(window,'__deckHost',{value:api})
await controller.load(makeDeck(ids))
</script></body></html>`,
  )
}
