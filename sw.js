/* =========================================================
   Salva — Desarrollado y respaldado por LC Tech
   Service Worker: habilita la instalación como app (PWA).
   Privacidad (Ley 1581): NUNCA guarda en caché datos médicos ni
   respuestas de Supabase/Wompi; las páginas se piden siempre a la red.
   ========================================================= */
var VERSION = 'salva-v1';
var OFFLINE = '/offline.html';
var PRECARGA = [OFFLINE, '/icons/icon-192.png', '/salva-emblem.jpg'];
var ESTATICOS = /\.(css|js|jpg|jpeg|png|svg|webp|woff2?)$/i;

self.addEventListener('install', function (evento) {
  evento.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(PRECARGA); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (c) { return c !== VERSION; }).map(function (c) { return caches.delete(c); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  var peticion = evento.request;
  if (peticion.method !== 'GET') return;
  var url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return; // Supabase, Wompi, mapas: siempre directo a la red

  // Páginas (ficha, panel, landing): siempre de la red; sin conexión, aviso amable
  if (peticion.mode === 'navigate') {
    evento.respondWith(fetch(peticion).catch(function () { return caches.match(OFFLINE); }));
    return;
  }

  // Estilos, scripts e imágenes propios: red primero (siempre la última versión), caché de respaldo
  if (ESTATICOS.test(url.pathname) && url.pathname !== '/sw.js') {
    evento.respondWith(
      fetch(peticion).then(function (respuesta) {
        if (respuesta.ok) {
          var copia = respuesta.clone();
          caches.open(VERSION).then(function (cache) { cache.put(peticion, copia); });
        }
        return respuesta;
      }).catch(function () { return caches.match(peticion); })
    );
  }
});
