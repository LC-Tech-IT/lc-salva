/* =========================================================
   Salva — Desarrollado y respaldado por LC Tech
   Service Worker: habilita la instalación como app (PWA).
   Privacidad (Ley 1581): NUNCA guarda en caché datos médicos ni
   respuestas de Supabase/Wompi; las páginas se piden siempre a la red.
   ========================================================= */
// Versión de la app + commit de cada despliegue (lo inserta el script de construcción):
// "v2.2" identifica la versión del producto y el commit garantiza que el navegador
// detecte CADA despliegue nuevo y ofrezca "Actualizar".
var VERSION = 'salva-v2.2-__SALVA_VERSION__';
var OFFLINE = '/offline.html';
var PRECARGA = [OFFLINE, '/icons/icon-192.png', '/salva-emblem.jpg'];
var ESTATICOS = /\.(css|js|jpg|jpeg|png|svg|webp|woff2?)$/i;

self.addEventListener('install', function (evento) {
  // Sin skipWaiting aquí: la versión nueva espera hasta que el usuario toque "Actualizar"
  evento.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(PRECARGA); }));
});

self.addEventListener('message', function (evento) {
  if (evento.data && evento.data.tipo === 'ACTIVAR_NUEVA_VERSION') self.skipWaiting();
});

// Al activarse, se borran de inmediato TODAS las cachés anteriores
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
