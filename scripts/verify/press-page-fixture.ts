export const PRESS_PAGE_HTML = `<!doctype html><style>
@page{size:1200px 800px;margin:0}*{box-sizing:border-box}html,body{margin:0;width:1200px;height:800px}
body{padding:34px;font:18px Arial,sans-serif;color:#000;background:#fff}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}
.tile{min-height:105px;padding:12px;border:5px solid #0080ff}.gray{color:#333}.color{color:#e02070}.solid{background:#f4b942}
.two{background:linear-gradient(90deg,#f00,#00f)}.three{background:linear-gradient(90deg,#0f0 0%,#f0f 45%,#0ff 100%)}
.radial{background:radial-gradient(circle,#ff0 0%,#ff8000 55%,#202080 100%)}.shadow{background:#eee;box-shadow:8px 8px 12px rgba(20,100,220,.7)}
.textshadow{color:#804000;text-shadow:4px 4px 4px rgba(0,180,40,.75)}.under{background:#0060d0;padding:10px}.opacity{opacity:.5;background:#ff2000;padding:18px}
svg{width:100%;height:78px}img{width:96px;height:64px;object-fit:cover;margin-right:8px}
</style><h1>Press color probe: <span class="gray">#333 gray</span> <span class="color">colored text</span></h1><div class="grid">
<div class="tile solid">Solid fill and blue border</div><div class="tile two">Two-stop linear gradient</div><div class="tile three">Three-stop linear gradient</div>
<div class="tile radial">Radial gradient</div><div class="tile shadow">Blurred box shadow</div><div class="tile textshadow">Blurred text shadow</div>
<div class="tile under"><div class="opacity">50% opacity over blue</div></div><div class="tile"><svg viewBox="0 0 240 80"><rect x="8" y="8" width="88" height="62" fill="#20c080"/><circle cx="165" cy="40" r="30" fill="#f05020" stroke="#7020c0" stroke-width="9"/></svg></div>
<div class="tile"><img id="png"><img id="jpeg"><div>embedded PNG + JPEG</div></div><div class="tile" style="color:#00ff00;font-weight:bold">Saturated green</div><div class="tile">Black text #000 😀</div></div>
<script>function image(type){const c=document.createElement('canvas');c.width=96;c.height=64;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,96,64);g.addColorStop(0,'#ff3040');g.addColorStop(1,'#10d0ff');x.fillStyle=g;x.fillRect(0,0,96,64);x.fillStyle='#00ff00';x.fillRect(34,18,28,28);if(type==='image/png')x.clearRect(0,0,12,12);return c.toDataURL(type,.86)}png.src=image('image/png');jpeg.src=image('image/jpeg');pageReady()</script>`
