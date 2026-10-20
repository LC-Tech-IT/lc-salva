/* =========================================================
   Salva — Desarrollado y respaldado por LC Tech
   pwa.js — Instalación de la App Salva (PWA) en iPhone y Android.
   Expone window.SalvaPWA para la landing y el panel.
   ========================================================= */
(function () {
  'use strict';

  var ua = navigator.userAgent || '';
  var esIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var esMovil = esIOS || /android|mobile/i.test(ua);
  var instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var promptDiferido = null;
  var oyentes = [];

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (error) {
        console.warn('Service Worker no registrado:', error && error.message);
      });
    });
  }

  function estado() {
    return { instalada: instalada, nativa: !!promptDiferido, ios: esIOS, movil: esMovil };
  }

  function notificar() {
    var e = estado();
    oyentes.forEach(function (fn) { fn(e); });
  }

  // Android / Chrome / Edge: el navegador ofrece la instalación nativa
  window.addEventListener('beforeinstallprompt', function (evento) {
    evento.preventDefault();
    promptDiferido = evento;
    notificar();
  });

  window.addEventListener('appinstalled', function () {
    promptDiferido = null;
    instalada = true;
    notificar();
  });

  /* ---------- Guía visual (iPhone y navegadores sin instalación automática) ---------- */
  var ICONO_COMPARTIR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

  function mostrarGuia(tipo) {
    var existente = document.getElementById('pwaGuia');
    if (existente) existente.remove();

    var pasos = tipo === 'ios'
      ? ['Toca el botón <strong>Compartir</strong> ' + ICONO_COMPARTIR + ' en la barra de Safari.',
         'Desliza y elige <strong>“Agregar a pantalla de inicio”</strong>.',
         'Toca <strong>“Agregar”</strong>: el ícono de Salva aparecerá junto a tus apps.']
      : ['Abre el menú del navegador (<strong>⋮</strong> o <strong>…</strong>).',
         'Elige <strong>“Instalar app”</strong> o <strong>“Agregar a pantalla de inicio”</strong>.',
         'Confirma y abre Salva desde tu pantalla de inicio.'];

    var capa = document.createElement('div');
    capa.id = 'pwaGuia';
    capa.className = 'pwa-guia';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-labelledby', 'pwaGuiaTitulo');
    capa.innerHTML =
      '<div class="pwa-guia-tarjeta">' +
        '<button type="button" class="pwa-guia-cerrar" aria-label="Cerrar">✕</button>' +
        '<img src="icons/icon-192.png" alt="" class="pwa-guia-icono">' +
        '<h2 id="pwaGuiaTitulo">' + (tipo === 'ios' ? 'Instala Salva en tu iPhone' : 'Instala la App Salva') + '</h2>' +
        '<ol class="pwa-guia-pasos">' + pasos.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol>' +
        (tipo === 'ios' ? '<p class="pwa-guia-nota">Si no ves la opción, abre esta página en Safari.</p>' : '') +
        '<button type="button" class="pwa-guia-listo">Entendido</button>' +
      '</div>';

    function cerrar() { capa.remove(); }
    capa.addEventListener('click', function (e) { if (e.target === capa) cerrar(); });
    capa.querySelector('.pwa-guia-cerrar').addEventListener('click', cerrar);
    capa.querySelector('.pwa-guia-listo').addEventListener('click', cerrar);
    document.body.appendChild(capa);
  }

  function instalar() {
    if (instalada) return Promise.resolve('instalada');
    if (esIOS) { mostrarGuia('ios'); return Promise.resolve('guia-ios'); } // Safari no ofrece instalación automática
    if (promptDiferido) {
      var evento = promptDiferido;
      promptDiferido = null;
      evento.prompt();
      return evento.userChoice.then(function (r) { notificar(); return r.outcome; });
    }
    mostrarGuia(esIOS ? 'ios' : 'general');
    return Promise.resolve('guia');
  }

  window.SalvaPWA = {
    estado: estado,
    instalar: instalar,
    mostrarGuia: mostrarGuia,
    alCambiar: function (fn) { oyentes.push(fn); fn(estado()); }
  };
})();
