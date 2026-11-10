const CACHE='time-lab-v0.2.0';
const ASSETS=['./','./index.html','./style.css','./app.js','./core.js','./enhancements.js','./manifest.webmanifest','./icon.svg','./icon.png','./icon-512.png','./vendor/tesseract.min.js','./vendor/worker.min.js','./vendor/tesseract-core-lstm.wasm.js','./vendor/tesseract-core-lstm.wasm','./vendor/eng.traineddata.gz'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('time-lab-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
