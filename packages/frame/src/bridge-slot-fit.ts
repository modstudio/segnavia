export function slotFitBridgeScript(message: string): string {
  return `var slotFitTries=0;
var slotFitElements=[],slotFitSlots={},slotFitPosted=false;
var slotFit=function(done,postResult){var marked=document.querySelectorAll('[data-slot-overflow]');if(!marked.length){if(done)done(slotFitSlots);return;}var slots=slotFitSlots;var rank={fit:0,shrunk:1,overflowed:2};var unlaid=false;
var fits=function(element){return element.scrollWidth<=element.clientWidth&&element.scrollHeight<=element.clientHeight;};
var record=function(key,state){if(slots[key]===undefined||rank[state]>rank[slots[key]])slots[key]=state;};
for(var s=0;s<marked.length;s++){var element=marked[s];if(slotFitElements.indexOf(element)!==-1)continue;if(element.getClientRects().length===0){unlaid=true;continue;}var parts=element.getAttribute('data-slot-overflow').split(':');var key;try{key=decodeURIComponent(parts[0]);}catch(error){continue;}var mode=parts[1];var state='fit';
if(mode==='truncate'){element.style.whiteSpace='nowrap';element.style.overflow='hidden';element.style.textOverflow='ellipsis';state=fits(element)?'fit':'overflowed';}
else if(mode==='shrink'){var fitted=element.getAttribute('data-segnavia-fit-state');if(fitted){state=fitted==='shrunk'?'shrunk':fits(element)?'fit':'overflowed';}else{var size=parseFloat(element.style.fontSize);if(!isFinite(size))size=parseFloat(window.getComputedStyle(element).fontSize);var minimum=parseFloat(parts[2]);if(!isFinite(size)||!isFinite(minimum)||minimum<1||minimum>size)continue;var measurements=1;if(fits(element)){state='fit';}else{element.style.fontSize=minimum+'px';measurements++;if(!fits(element)){state='overflowed';}else{var low=minimum,high=size,best=minimum;while(measurements<64&&high-low>.01){var middle=(low+high)/2;element.style.fontSize=middle+'px';measurements++;if(fits(element)){best=middle;low=middle;}else{high=middle;}}element.style.fontSize=best+'px';state='shrunk';}}}}
else if(mode==='refuse'){state=fits(element)?'fit':'overflowed';}else{continue;}record(key,state);slotFitElements.push(element);}
if(unlaid&&slotFitTries<40){slotFitTries++;var retry=function(){slotFit(done,postResult);};if(!window.requestAnimationFrame){setTimeout(retry,50);return;}var finished=false;var finish=function(){if(finished)return;finished=true;retry();};var fallback=setTimeout(finish,50);window.requestAnimationFrame(function(){clearTimeout(fallback);finish();});return;}
if(postResult!==false&&!slotFitPosted){slotFitPosted=true;post({type:'${message}',slots:slots});}if(done)done(slots);};`
}
