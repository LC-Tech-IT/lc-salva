/* =========================================================
   Salva — Desarrollado y respaldado por LC Tech
   app.js — Navegación, carrusel del hero, fichas médicas de
   demostración, checkout en 2 pasos (Wompi + WhatsApp),
   previsualizador de color y chatbot
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Año dinámico en footer ---------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Menú móvil ---------- */
  var navToggle = document.getElementById('navToggle');
  var mainNav = document.getElementById('mainNav');

  if (navToggle && mainNav) {
    navToggle.addEventListener('click', function () {
      var isOpen = mainNav.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mainNav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        mainNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* =========================================================
     HERO — Carrusel Automático de Alto Impacto
     ========================================================= */
  var carouselSlides = document.querySelectorAll('#heroCarousel .carousel-slide');
  var carouselDots = document.querySelectorAll('#carouselDots .carousel-dot');
  var btnPrev = document.getElementById('carouselPrev');
  var btnNext = document.getElementById('carouselNext');
  var heroCarousel = document.getElementById('heroCarousel');

  var currentSlide = 0;
  var totalSlides = carouselSlides.length;
  var carouselTimer = null;

  function mostrarSlide(index) {
    if (totalSlides === 0) return;
    currentSlide = (index + totalSlides) % totalSlides;

    carouselSlides.forEach(function (slide, idx) {
      slide.classList.toggle('active', idx === currentSlide);
    });

    carouselDots.forEach(function (dot, idx) {
      dot.classList.toggle('active', idx === currentSlide);
    });
  }

  function siguienteSlide() {
    mostrarSlide(currentSlide + 1);
  }

  function anteriorSlide() {
    mostrarSlide(currentSlide - 1);
  }

  function iniciarAutoplay() {
    detenerAutoplay();
    carouselTimer = setInterval(siguienteSlide, 4500);
  }

  function detenerAutoplay() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  if (heroCarousel && totalSlides > 1) {
    iniciarAutoplay();
    heroCarousel.addEventListener('mouseenter', detenerAutoplay);
    heroCarousel.addEventListener('mouseleave', iniciarAutoplay);
    heroCarousel.addEventListener('touchstart', detenerAutoplay, { passive: true });
    heroCarousel.addEventListener('touchend', iniciarAutoplay, { passive: true });
  }

  if (btnNext) btnNext.addEventListener('click', function () { siguienteSlide(); iniciarAutoplay(); });
  if (btnPrev) btnPrev.addEventListener('click', function () { anteriorSlide(); iniciarAutoplay(); });

  carouselDots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      var target = Number(dot.getAttribute('data-target')) || 0;
      mostrarSlide(target);
      iniciarAutoplay();
    });
  });

  /* =========================================================
     MODAL DE HISTORIAL CLÍNICO / FICHA MÉDICA DE EMERGENCIA
     ========================================================= */
  var DATOS_FICHAS = {
    nino: {
      nombre: 'Sofía Ramírez Vargas',
      sub: '7 años · Portadora de Salva Band',
      sangre: 'O Positivo (O+)',
      eps: 'Sura EPS (Plan Complementario)',
      alergias: 'Penicilina y Frutos Secos (Riesgo Anafilaxia).',
      condiciones: 'Asma bronquial leve controlada. Usa Salbutamol ante crisis respiratoria.',
      contactos: [
        { tipo: 'tel', texto: '📞 Mamá (Andrea V. - 300 123 4567)', href: 'tel:3001234567', clase: 'sos-call' },
        { tipo: 'wa', texto: '💬 WhatsApp Papá (Carlos R.)', href: 'https://wa.me/573505208592?text=Hola,%20tengo%20a%20tu%20hija%20Sofía', clase: 'sos-whatsapp' }
      ]
    },
    mayor: {
      nombre: 'Don Alberto Gómez Restrepo',
      sub: '74 años · Portador de Salva Band',
      sangre: 'A Positivo (A+)',
      eps: 'Sanitas EPS / Medicina Prepagada',
      alergias: 'Sulfas, AINEs y Dipirona.',
      condiciones: 'Hipertensión arterial y Diabetes Tipo 2. Medicación diaria: Losartán 50mg, Metformina 850mg.',
      contactos: [
        { tipo: 'tel', texto: '📞 Hijo (Ing. Andrés Gómez - 310 987 6543)', href: 'tel:3109876543', clase: 'sos-call' },
        { tipo: 'wa', texto: '💬 WhatsApp Hija (Dra. Marcela G.)', href: 'https://wa.me/573505208592?text=Hola,%20estoy%20con%20Don%20Alberto%20Gómez', clase: 'sos-whatsapp' }
      ]
    },
    motero: {
      nombre: 'Carlos Mendoza Ríos (Ciclista & Rider)',
      sub: '29 años · Portador de Salva Watch (Ruta / Ciudad)',
      sangre: 'O Negativo (O- Donante Universal)',
      eps: 'Compensar EPS + Póliza Deportiva & Todo Riesgo',
      alergias: 'Sin alergias conocidas a medicamentos.',
      condiciones: 'Material de osteosíntesis en fémur derecho. Seguro contra accidentes en ruta vigente.',
      contactos: [
        { tipo: 'tel', texto: '📞 Contacto SOS Hermana (Valeria M.)', href: 'tel:3154567890', clase: 'sos-call' },
        { tipo: 'wa', texto: '💬 WhatsApp Contacto SOS de Ruta', href: 'https://wa.me/573505208592?text=Alerta%20Accidente%20Ruta%20Carlos%20Mendoza', clase: 'sos-whatsapp' }
      ]
    }
  };

  var modalFichaDemo = document.getElementById('modalFichaDemo');

  function abrirFichaDemo(personaKey) {
    var info = DATOS_FICHAS[personaKey] || DATOS_FICHAS.nino;
    
    document.getElementById('tituloModalFicha').textContent = info.nombre;
    document.getElementById('subModalFicha').textContent = info.sub;
    document.getElementById('modalFichaSangre').textContent = info.sangre;
    document.getElementById('modalFichaEPS').textContent = info.eps;
    document.getElementById('modalFichaAlergias').textContent = info.alergias;
    document.getElementById('modalFichaCondiciones').textContent = info.condiciones;

    var containerContactos = document.getElementById('modalFichaContactos');
    containerContactos.innerHTML = '';

    info.contactos.forEach(function (c) {
      var a = document.createElement('a');
      a.href = c.href;
      a.className = 'sos-btn ' + c.clase;
      if (c.tipo === 'wa') {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      a.innerHTML = '<span>' + c.texto + '</span>';
      containerContactos.appendChild(a);
    });

    modalFichaDemo.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function cerrarModalFicha() {
    modalFichaDemo.hidden = true;
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.btn-ver-ficha').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var persona = btn.getAttribute('data-persona');
      abrirFichaDemo(persona);
    });
  });

  document.querySelectorAll('[data-close-modal="modalFichaDemo"]').forEach(function (btn) {
    btn.addEventListener('click', cerrarModalFicha);
  });

  if (modalFichaDemo) {
    modalFichaDemo.addEventListener('click', function (e) {
      if (e.target === modalFichaDemo) cerrarModalFicha();
    });
  }

  /* =========================================================
     MODAL: POLÍTICA DE TRATAMIENTO DE DATOS (LEY 1581 DE 2012)
     ========================================================= */
  var modalPrivacidad = document.getElementById('modalPrivacidad');

  function abrirModalPrivacidad(e) {
    if (e) e.preventDefault();
    if (!modalPrivacidad) return;
    modalPrivacidad.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function cerrarModalPrivacidad() {
    if (!modalPrivacidad) return;
    modalPrivacidad.hidden = true;
    // Si se abrió desde el checkout, el modal de compra sigue activo debajo
    var compraAbierta = document.getElementById('modalCompra');
    if (!compraAbierta || compraAbierta.hidden) document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-abrir-modal="modalPrivacidad"]').forEach(function (link) {
    link.addEventListener('click', abrirModalPrivacidad);
  });

  document.querySelectorAll('[data-close-modal="modalPrivacidad"]').forEach(function (btn) {
    btn.addEventListener('click', cerrarModalPrivacidad);
  });

  if (modalPrivacidad) {
    modalPrivacidad.addEventListener('click', function (e) {
      if (e.target === modalPrivacidad) cerrarModalPrivacidad();
    });
  }

  /* =========================================================
     FAQ — Acordeón de preguntas frecuentes
     ========================================================= */
  document.querySelectorAll('.faq-question').forEach(function (boton) {
    boton.addEventListener('click', function () {
      var item = boton.closest('.faq-item');
      var yaAbierto = item.classList.contains('open');

      document.querySelectorAll('.faq-item').forEach(function (otro) {
        otro.classList.remove('open');
        otro.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
      });

      if (!yaAbierto) {
        item.classList.add('open');
        boton.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* =========================================================
     CHECKOUT EN 2 PASOS — Personalización + Domicilio y entrega
     ========================================================= */
  var NUMERO_WHATSAPP_VENTAS = '573505208592';

  var SUPABASE_URL = 'https://bfxolduuqkrhyfjrvwsx.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_xcSIX2__GnOZ6vL7__BuOQ_pEQ5L-FJ';

  var WOMPI = {
    publicKey: 'pub_prod_TrD9iOZvcojMYGSpGfw6fnXg63ZJvh20', // Llave de producción real de Wompi (Bancolombia)
    scriptUrl: 'https://checkout.wompi.co/widget.js',
    timeoutMs: 8000,
    // Wompi exige signature:integrity = SHA256(referencia + montoEnCentavos + moneda + secretoIntegridad).
    // El secreto NUNCA va en el frontend: se calcula en la Edge Function supabase/functions/wompi-firma.
    // Pega aquí su URL una vez desplegada (ej: https://<proyecto>.supabase.co/functions/v1/wompi-firma).
    firmaIntegridadUrl: ''
  };
  WOMPI.apiUrl = WOMPI.publicKey.indexOf('pub_test_') === 0
    ? 'https://sandbox.wompi.co/v1'
    : 'https://production.wompi.co/v1';

  // Catálogo físico 100% pasivo
  var PRECIOS = { band: 59000, watch: 45000, pack: 89000 };
  var NOMBRES_MODELO = { band: 'Salva Band', watch: 'Salva Watch', pack: 'Pack Dúo Familiar (Salva Watch + Salva Band)' };
  // Enlaces antiguos (modelos con batería ya retirados) abren la Salva Band
  var ALIAS_MODELO = { basica: 'band', premium: 'band', pro: 'band' };

  // Order bump: 1 año de Salva Cloud Familiar con descuento de checkout
  var PRECIO_ORDER_BUMP = 49000;
  var PRECIO_CLOUD_ANUAL_REGULAR = 79000;

  var COLORES_SALVA = {
    'Negro Obsidiana': { hex: '#1A1D21', tinta: '#E5E7EB', desc: 'Negro mate carbón' },
    'Gris Titanio': { hex: '#4A5058', tinta: '#F1F5F9', desc: 'Gris grafito mate' },
    'Azul Marino Profundo': { hex: '#1B2A4A', tinta: '#E2E8F0', desc: 'Azul marino mate' },
    'Verde Bosque': { hex: '#1F4D3A', tinta: '#E3EFE8', desc: 'Verde bosque mate' },
    'Rojo Carmesí': { hex: '#9B1C2E', tinta: '#FEE2E2', desc: 'Rojo carmesí mate' },
    'Rosa Coral': { hex: '#E8768A', tinta: '#FFFFFF', desc: 'Rosa coral suave' }
  };

  var DEPARTAMENTOS_CO = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá',
    'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía',
    'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo',
    'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca',
    'Vaupés', 'Vichada'];

  var modalCompra = document.getElementById('modalCompra');
  var checkoutModelo = document.getElementById('checkoutModelo');
  var checkoutDestinatario = document.getElementById('checkoutDestinatario');
  var checkoutColor = document.getElementById('checkoutColor');
  var checkoutTalla = document.getElementById('checkoutTalla');
  var checkoutFormView = document.getElementById('checkoutFormView');
  var checkoutPaso1 = document.getElementById('checkoutPaso1');
  var checkoutPaso2 = document.getElementById('checkoutPaso2');
  var checkoutResultadoView = document.getElementById('checkoutResultadoView');
  var btnPagarWompi = document.getElementById('btnPagarOnlineWompi');
  var btnComprarWhatsapp = document.getElementById('btnComprarWhatsapp');
  var wompiFallback = document.getElementById('wompiFallback');

  var estadoCheckout = {
    codigoPedido: null,
    intentoPago: 0,
    firmaPedidoRegistrado: null,
    pagoEnCurso: false,
    orderBump: false
  };

  function formatoCOP(numero) {
    var texto = String(Math.round(numero)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return '$' + texto + ' COP';
  }

  function modeloActual() {
    return checkoutModelo && PRECIOS[checkoutModelo.value] ? checkoutModelo.value : 'band';
  }

  function precioModeloActual() {
    return PRECIOS[modeloActual()];
  }

  function totalActual() {
    return precioModeloActual() + (estadoCheckout.orderBump ? PRECIO_ORDER_BUMP : 0);
  }

  function actualizarTotales() {
    var total = formatoCOP(totalActual());
    ['checkoutTotal', 'checkoutTotalPaso2'].forEach(function (id) {
      var nodo = document.getElementById(id);
      if (nodo) nodo.textContent = total;
    });
  }

  function aplicarOrderBump(activo) {
    estadoCheckout.orderBump = !!activo;
    document.querySelectorAll('[data-order-bump]').forEach(function (check) {
      check.checked = estadoCheckout.orderBump;
      var tarjeta = check.closest('.order-bump');
      if (tarjeta) tarjeta.classList.toggle('is-activo', estadoCheckout.orderBump);
    });
    actualizarTotales();
    actualizarResumenPaso2();
    actualizarMensajeWhatsappCompra();
  }

  document.querySelectorAll('[data-order-bump]').forEach(function (check) {
    check.addEventListener('change', function () {
      aplicarOrderBump(check.checked);
      vibrar();
    });
  });

  function colorActual() {
    return checkoutColor && COLORES_SALVA[checkoutColor.value] ? checkoutColor.value : 'Negro Obsidiana';
  }

  function tallaActual() {
    return checkoutTalla ? checkoutTalla.value : '20';
  }

  var checkoutAncho = document.getElementById('checkoutAncho');

  function anchoActual() {
    return checkoutAncho ? checkoutAncho.value : '22';
  }

  function incluyeBand() { return modeloActual() !== 'watch'; }
  function incluyeWatch() { return modeloActual() !== 'band'; }

  function descripcionTalla() {
    if (modeloActual() === 'watch') return 'correa de ' + anchoActual() + ' mm';
    if (modeloActual() === 'pack') return 'pulsera ' + tallaActual() + ' cm + correa de ' + anchoActual() + ' mm';
    return tallaActual() + ' cm';
  }

  function descripcionColor() {
    if (modeloActual() === 'watch') return 'Acero inoxidable 316L';
    if (modeloActual() === 'pack') return colorActual() + ' (Band) + acero 316L (Watch)';
    return colorActual();
  }

  function seleccionarAncho(ancho) {
    if (checkoutAncho) checkoutAncho.value = ancho;
    document.querySelectorAll('#checkoutAnchoSelector .talla-opcion').forEach(function (opcion) {
      opcion.classList.toggle('active', opcion.getAttribute('data-ancho') === String(ancho));
    });
    actualizarResumenPaso2();
    actualizarMensajeWhatsappCompra();
  }

  document.querySelectorAll('#checkoutAnchoSelector .talla-opcion').forEach(function (opcion) {
    opcion.addEventListener('click', function () {
      seleccionarAncho(opcion.getAttribute('data-ancho'));
      vibrar();
    });
  });

  // Muestra solo las opciones que aplican al producto elegido
  function ajustarOpcionesPorProducto() {
    var band = incluyeBand();
    var watch = incluyeWatch();
    [['checkoutBloqueColor', !band], ['checkoutColorPreview', !band], ['checkoutBloqueTalla', !band],
     ['checkoutBloqueAncho', !watch], ['checkoutAcabadoWatch', !watch]].forEach(function (par) {
      var nodo = document.getElementById(par[0]);
      if (nodo) nodo.hidden = par[1];
    });
  }

  function vibrar() {
    var huboToque = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && huboToque) {
      try { navigator.vibrate(12); } catch (e) { /* sin soporte háptico */ }
    }
  }

  /* ---------- Previsualizador de color en tiempo real ---------- */
  function pintarPreview(previewEl, color, descripcion) {
    if (!previewEl) return;
    var info = COLORES_SALVA[color] || COLORES_SALVA['Negro Obsidiana'];
    previewEl.style.setProperty('--band', info.hex);
    previewEl.style.setProperty('--band-ink', info.tinta);
    var nombreEl = previewEl.querySelector('[data-preview-name]');
    var descEl = previewEl.querySelector('[data-preview-desc]');
    if (nombreEl) nombreEl.textContent = color;
    if (descEl) descEl.textContent = descripcion;
    previewEl.classList.remove('is-updating');
    void previewEl.offsetWidth; // reinicia la animación de feedback
    previewEl.classList.add('is-updating');
  }

  function actualizarPreviews() {
    var color = colorActual();
    var info = COLORES_SALVA[color];
    pintarPreview(document.getElementById('checkoutColorPreview'), color,
      info.desc + ' · ' + (modeloActual() === 'pack' ? 'Salva Band del pack' : 'Salva Band') + ' · ' + tallaActual() + ' cm');
    pintarPreview(document.getElementById('modelosColorPreview'), color,
      info.desc + ' · Silicona unibody hipoalergénica');
  }

  function seleccionarColor(color, conFeedback) {
    if (!COLORES_SALVA[color]) return;
    if (checkoutColor) checkoutColor.value = color;
    document.querySelectorAll('#checkoutColorSelector .color-opcion, #modelosColorChips .color-chip').forEach(function (opcion) {
      var activo = opcion.getAttribute('data-color') === color;
      opcion.classList.toggle('active', activo);
      opcion.setAttribute('aria-pressed', String(activo));
    });
    actualizarPreviews();
    actualizarMensajeWhatsappCompra();
    if (conFeedback) vibrar();
  }

  function seleccionarModelo(modelo) {
    if (ALIAS_MODELO[modelo]) modelo = ALIAS_MODELO[modelo];
    if (!PRECIOS[modelo]) modelo = 'band';
    if (checkoutModelo) checkoutModelo.value = modelo;
    ajustarOpcionesPorProducto();
    document.querySelectorAll('#checkoutModeloSelector .modelo-card').forEach(function (card) {
      var activo = card.getAttribute('data-modelo') === modelo;
      card.classList.toggle('active', activo);
      card.setAttribute('aria-checked', String(activo));
    });
    actualizarTotales();
    actualizarResumenPaso2();
    actualizarPreviews();
    actualizarMensajeWhatsappCompra();
  }

  function seleccionarTallaCheckout(talla) {
    if (checkoutTalla) checkoutTalla.value = talla;
    document.querySelectorAll('#checkoutTallaSelector .talla-opcion').forEach(function (opcion) {
      opcion.classList.toggle('active', opcion.getAttribute('data-talla') === String(talla));
    });
    actualizarPreviews();
    actualizarMensajeWhatsappCompra();
  }

  document.querySelectorAll('#checkoutColorSelector .color-opcion, #modelosColorChips .color-chip').forEach(function (opcion) {
    opcion.addEventListener('click', function () {
      seleccionarColor(opcion.getAttribute('data-color'), true);
    });
  });

  document.querySelectorAll('#checkoutModeloSelector .modelo-card').forEach(function (card) {
    card.addEventListener('click', function () {
      seleccionarModelo(card.getAttribute('data-modelo'));
      vibrar();
    });
  });

  document.querySelectorAll('#checkoutTallaSelector .talla-opcion').forEach(function (opcion) {
    opcion.addEventListener('click', function () {
      seleccionarTallaCheckout(opcion.getAttribute('data-talla'));
      vibrar();
    });
  });

  if (checkoutDestinatario) checkoutDestinatario.addEventListener('change', actualizarMensajeWhatsappCompra);

  /* ---------- Navegación entre pasos ---------- */
  function actualizarResumenPaso2() {
    var resumen = document.getElementById('checkoutResumenTexto');
    if (!resumen) return;
    var color = colorActual();
    resumen.innerHTML = '';
    var swatch = document.createElement('span');
    swatch.className = 'checkout-resumen-swatch';
    swatch.style.background = incluyeBand() ? COLORES_SALVA[color].hex : '#B8BEC6';
    var modelo = document.createElement('strong');
    modelo.textContent = NOMBRES_MODELO[modeloActual()];
    var precio = document.createElement('strong');
    precio.textContent = formatoCOP(totalActual());
    resumen.appendChild(swatch);
    resumen.appendChild(modelo);
    resumen.appendChild(document.createTextNode(' · ' + descripcionColor() + ' · ' + descripcionTalla() +
      (estadoCheckout.orderBump ? ' + Salva Cloud 1 año' : '') + ' · '));
    resumen.appendChild(precio);
  }

  function irAPaso(paso) {
    if (checkoutPaso1) checkoutPaso1.hidden = paso !== 1;
    if (checkoutPaso2) checkoutPaso2.hidden = paso !== 2;
    document.querySelectorAll('.checkout-stepper .stepper-item').forEach(function (item) {
      var n = Number(item.getAttribute('data-step-indicator'));
      item.classList.toggle('active', n === paso);
      item.classList.toggle('done', n < paso);
      if (n === paso) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    if (paso === 2) actualizarResumenPaso2();
    var modalEl = modalCompra ? modalCompra.querySelector('.modal') : null;
    if (modalEl) modalEl.scrollTop = 0;
    if (paso === 2) {
      var primerCampo = document.getElementById('envioNombre');
      if (primerCampo && !primerCampo.value) setTimeout(function () { primerCampo.focus({ preventScroll: true }); }, 60);
    }
  }

  var btnContinuar = document.getElementById('btnCheckoutContinuar');
  if (btnContinuar) btnContinuar.addEventListener('click', function () { irAPaso(2); });

  document.querySelectorAll('[data-ir-paso]').forEach(function (btn) {
    btn.addEventListener('click', function () { irAPaso(Number(btn.getAttribute('data-ir-paso')) || 1); });
  });

  /* ---------- Paso 2: datos de domicilio ---------- */
  var selectDepartamento = document.getElementById('envioDepartamento');
  if (selectDepartamento) {
    DEPARTAMENTOS_CO.forEach(function (dep) {
      var opt = document.createElement('option');
      opt.value = dep;
      opt.textContent = dep;
      selectDepartamento.appendChild(opt);
    });
  }

  function valorCampo(id) {
    var nodo = document.getElementById(id);
    return nodo ? nodo.value.trim() : '';
  }

  function soloDigitos(texto) {
    return String(texto || '').replace(/\D/g, '');
  }

  function celularNormalizado() {
    var digitos = soloDigitos(valorCampo('envioTelefono'));
    if (digitos.length === 12 && digitos.indexOf('57') === 0) digitos = digitos.slice(2);
    return digitos;
  }

  var VALIDACIONES_ENVIO = {
    envioNombre: function (v) {
      if (!v) return 'Escribe el nombre de quien recibe el paquete.';
      if (v.split(/\s+/).length < 2) return 'Incluye nombre y apellido.';
      return '';
    },
    envioTelefono: function () {
      var d = celularNormalizado();
      if (!d) return 'El celular es obligatorio para coordinar la entrega.';
      if (d.length !== 10 || d.charAt(0) !== '3') return 'Ingresa un celular colombiano de 10 dígitos (ej: 300 123 4567).';
      return '';
    },
    envioDireccion: function (v) {
      if (!v) return 'La dirección exacta es obligatoria.';
      if (v.length < 6 || !/\d/.test(v)) return 'Incluye calle/carrera y número (ej: Calle 127 # 15-45).';
      return '';
    },
    envioCiudad: function (v) { return v.length >= 2 ? '' : 'Indica la ciudad o municipio.'; },
    envioDepartamento: function (v) { return v ? '' : 'Selecciona el departamento.'; },
    envioBarrio: function (v) { return v.length >= 2 ? '' : 'Indica el barrio para la transportadora.'; },
    envioConsentimiento: function () {
      var check = document.getElementById('envioConsentimiento');
      return check && check.checked ? '' : 'Necesitamos tu autorización para gestionar el envío.';
    }
  };

  function validarCampoEnvio(id) {
    var mensaje = VALIDACIONES_ENVIO[id](valorCampo(id));
    var input = document.getElementById(id);
    var error = document.querySelector('.field-error[data-for="' + id + '"]');
    if (input) {
      input.classList.toggle('input-invalid', !!mensaje);
      input.setAttribute('aria-invalid', String(!!mensaje));
    }
    if (error) error.textContent = mensaje;
    return !mensaje;
  }

  function validarDatosEnvio() {
    var primerInvalido = null;
    Object.keys(VALIDACIONES_ENVIO).forEach(function (id) {
      if (!validarCampoEnvio(id) && !primerInvalido) primerInvalido = document.getElementById(id);
    });
    if (primerInvalido) {
      primerInvalido.scrollIntoView({ block: 'center', behavior: 'smooth' });
      primerInvalido.focus({ preventScroll: true });
      return false;
    }
    return true;
  }

  Object.keys(VALIDACIONES_ENVIO).forEach(function (id) {
    var input = document.getElementById(id);
    if (!input) return;
    var evento = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'blur';
    input.addEventListener(evento, function () { validarCampoEnvio(id); });
    input.addEventListener('input', function () {
      if (input.classList.contains('input-invalid')) validarCampoEnvio(id);
      actualizarMensajeWhatsappCompra();
    });
  });

  var envioIndicaciones = document.getElementById('envioIndicaciones');
  if (envioIndicaciones) envioIndicaciones.addEventListener('input', actualizarMensajeWhatsappCompra);

  function datosEnvio() {
    return {
      nombre: valorCampo('envioNombre'),
      telefono: celularNormalizado(),
      direccion: valorCampo('envioDireccion'),
      ciudad: valorCampo('envioCiudad'),
      departamento: valorCampo('envioDepartamento'),
      barrio: valorCampo('envioBarrio'),
      indicaciones: valorCampo('envioIndicaciones')
    };
  }

  /* ---------- Referencia y registro del pedido ---------- */
  function nuevoCodigoPedido() {
    var aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'SALVA-' + Date.now().toString(36).toUpperCase() + aleatorio;
  }

  function payloadPedido(metodoPago) {
    var envio = datosEnvio();
    var destinatario = checkoutDestinatario ? checkoutDestinatario.options[checkoutDestinatario.selectedIndex].text : '';
    return {
      codigo_pedido: estadoCheckout.codigoPedido,
      modelo: NOMBRES_MODELO[modeloActual()],
      diseno: descripcionColor(),
      talla: descripcionTalla(),
      nombre_cliente: envio.nombre,
      telefono_cliente: '+57' + envio.telefono,
      ciudad: envio.ciudad + ', ' + envio.departamento,
      direccion_entrega: envio.direccion + ' · Barrio ' + envio.barrio,
      metodo_pago: metodoPago,
      total_cop: totalActual(),
      notas: [
        estadoCheckout.orderBump ? 'Incluye Salva Cloud Familiar 1 año (order bump $49.000)' : '',
        envio.indicaciones,
        destinatario ? 'Uso: ' + destinatario : ''
      ].filter(Boolean).join(' · ')
    };
  }

  // Registra el pedido con sus datos de despacho bajo la referencia de pago.
  // Nunca bloquea el pago: si falla, la referencia y los datos viajan igual por Wompi/WhatsApp.
  function registrarPedido(metodoPago) {
    var payload = payloadPedido(metodoPago);
    var firma = JSON.stringify(payload);
    if (estadoCheckout.firmaPedidoRegistrado === firma) return Promise.resolve(true);

    var controlador = window.AbortController ? new AbortController() : null;
    var timer = controlador ? setTimeout(function () { controlador.abort(); }, 6000) : null;

    return fetch(SUPABASE_URL + '/rest/v1/pedidos', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: firma,
      keepalive: true,
      signal: controlador ? controlador.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.ok) estadoCheckout.firmaPedidoRegistrado = firma;
      return res.ok;
    }).catch(function () {
      if (timer) clearTimeout(timer);
      return false;
    });
  }

  /* ---------- Mensaje de WhatsApp con datos completos ---------- */
  function construirMensajeWhatsapp(motivo) {
    var envio = datosEnvio();
    var destinatario = checkoutDestinatario ? checkoutDestinatario.options[checkoutDestinatario.selectedIndex].text : 'mi familia';
    var lineas = [
      '🤖 *PEDIDO SALVA* — Ref: ' + (estadoCheckout.codigoPedido || 'por asignar'),
      motivo || 'Hola Asistente Salva, deseo completar mi pedido:',
      '',
      '• Modelo: ' + NOMBRES_MODELO[modeloActual()] + ' (' + formatoCOP(precioModeloActual()) + ')',
      '• Color / acabado: ' + descripcionColor(),
      '• Talla: ' + descripcionTalla(),
      '• Para: ' + destinatario
    ];
    if (estadoCheckout.orderBump) {
      lineas.push('• Incluye: Membresía Salva Cloud Familiar (1 Año con descuento de checkout: ' + formatoCOP(PRECIO_ORDER_BUMP) + ')');
    }
    lineas = lineas.concat([
      '• Total: ' + formatoCOP(totalActual()),
      '',
      '*Datos de entrega*',
      '• Recibe: ' + (envio.nombre || 'Por confirmar'),
      '• Celular: ' + (envio.telefono ? '+57 ' + envio.telefono : 'Por confirmar'),
      '• Dirección: ' + (envio.direccion || 'Por confirmar'),
      '• Barrio: ' + (envio.barrio || 'Por confirmar'),
      '• Ciudad: ' + ([envio.ciudad, envio.departamento].filter(Boolean).join(', ') || 'Por confirmar')
    ]);
    if (envio.indicaciones) lineas.push('• Indicaciones: ' + envio.indicaciones);
    lineas.push('', 'Por favor envíenme el enlace de pago seguro (Wompi/PSE).');
    return 'https://wa.me/' + NUMERO_WHATSAPP_VENTAS + '?text=' + encodeURIComponent(lineas.join('\n'));
  }

  function actualizarMensajeWhatsappCompra() {
    if (btnComprarWhatsapp) btnComprarWhatsapp.href = construirMensajeWhatsapp();
    var btnFallback = document.getElementById('btnFallbackWhatsapp');
    if (btnFallback) btnFallback.href = construirMensajeWhatsapp('No pude abrir la pasarela en línea. Deseo pagar por este medio:');
  }

  function enlaceWhatsappValidado(e) {
    // El pedido por WhatsApp también exige los datos de despacho completos
    if (!validarDatosEnvio()) {
      e.preventDefault();
      return;
    }
    actualizarMensajeWhatsappCompra();
    registrarPedido('WhatsApp (asesoría)');
  }

  if (btnComprarWhatsapp) btnComprarWhatsapp.addEventListener('click', enlaceWhatsappValidado);
  var btnFallbackWhatsapp = document.getElementById('btnFallbackWhatsapp');
  if (btnFallbackWhatsapp) btnFallbackWhatsapp.addEventListener('click', enlaceWhatsappValidado);

  /* ---------- Carga segura de Wompi (timeout + fallback) ---------- */
  var promesaWompi = null;

  function cargarWompi() {
    if (typeof window.WidgetCheckout === 'function') return Promise.resolve(window.WidgetCheckout);
    if (promesaWompi) return promesaWompi;

    promesaWompi = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = WOMPI.scriptUrl;
      script.async = true;

      var timer = setTimeout(function () { fallar(new Error('timeout')); }, WOMPI.timeoutMs);

      function fallar(error) {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (script.parentNode) script.parentNode.removeChild(script);
        promesaWompi = null; // permite reintentar
        reject(error);
      }

      script.onload = function () {
        clearTimeout(timer);
        if (typeof window.WidgetCheckout === 'function') resolve(window.WidgetCheckout);
        else fallar(new Error('widget-no-disponible'));
      };
      script.onerror = function () { fallar(new Error('bloqueado')); };
      document.head.appendChild(script);
    });
    return promesaWompi;
  }

  function estadoBotonPago(cargando, texto) {
    if (!btnPagarWompi) return;
    estadoCheckout.pagoEnCurso = cargando;
    btnPagarWompi.disabled = cargando;
    btnPagarWompi.classList.toggle('is-loading', cargando);
    btnPagarWompi.setAttribute('aria-busy', String(cargando));
    var textoEl = btnPagarWompi.querySelector('.btn-texto');
    var icono = btnPagarWompi.querySelector('.btn-icono');
    var spinner = btnPagarWompi.querySelector('.btn-spinner');
    if (cargando && !spinner) {
      spinner = document.createElement('span');
      spinner.className = 'btn-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      btnPagarWompi.insertBefore(spinner, btnPagarWompi.firstChild);
    }
    if (spinner) spinner.hidden = !cargando;
    if (icono) icono.style.display = cargando ? 'none' : '';
    if (textoEl) textoEl.textContent = texto || 'Pagar en línea con Wompi (PSE / Nequi / Tarjeta)';
  }

  function mostrarFallbackPago(titulo, texto) {
    if (!wompiFallback) return;
    document.getElementById('wompiFallbackTitulo').textContent = titulo;
    document.getElementById('wompiFallbackTexto').textContent = texto;
    actualizarMensajeWhatsappCompra();
    wompiFallback.hidden = false;
    wompiFallback.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function ocultarFallbackPago() {
    if (wompiFallback) wompiFallback.hidden = true;
  }

  // Valida la llave pública contra la API de Wompi antes de abrir el widget,
  // para no dejar al cliente frente a la pantalla de error interna de Wompi.
  var promesaComercio = null;
  function verificarComercioWompi() {
    if (promesaComercio) return promesaComercio;
    promesaComercio = fetch(WOMPI.apiUrl + '/merchants/' + encodeURIComponent(WOMPI.publicKey))
      .then(function (res) {
        if (!res.ok) throw new Error('llave-invalida');
        return true;
      })
      .catch(function (error) {
        promesaComercio = null;
        throw error && error.message === 'llave-invalida' ? error : new Error('bloqueado');
      });
    return promesaComercio;
  }

  function obtenerFirmaIntegridad(referencia, montoEnCentavos) {
    if (!WOMPI.firmaIntegridadUrl) return Promise.reject(new Error('sin-firma'));
    return fetch(WOMPI.firmaIntegridadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      body: JSON.stringify({ reference: referencia, amountInCents: montoEnCentavos, currency: 'COP' })
    }).then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('sin-firma')); })
      .then(function (json) {
        if (!json || !json.integrity) throw new Error('sin-firma');
        return json.integrity;
      });
  }

  var MENSAJES_FALLO_WOMPI = {
    timeout: ['La pasarela está tardando demasiado', 'Wompi no respondió en ' + (WOMPI.timeoutMs / 1000) + ' segundos. '],
    bloqueado: ['No pudimos abrir la pasarela de pago', 'Un bloqueador de anuncios o la red está impidiendo conectar con Wompi. '],
    'llave-invalida': ['Pago en línea temporalmente no disponible', 'La pasarela de pagos está en proceso de activación. '],
    'sin-firma': ['Pago en línea temporalmente no disponible', 'La pasarela de pagos está en proceso de activación. '],
    'widget-no-disponible': ['No pudimos abrir la pasarela de pago', 'Wompi no terminó de cargar correctamente. ']
  };

  function pagarConWompi() {
    if (estadoCheckout.pagoEnCurso) return;
    ocultarFallbackPago();
    if (!validarDatosEnvio()) return;

    estadoBotonPago(true, 'Conectando con la pasarela segura…');
    var registro = registrarPedido('Wompi (PSE / Nequi / Tarjeta)');

    estadoCheckout.intentoPago += 1;
    var referenciaPago = estadoCheckout.codigoPedido + '-P' + estadoCheckout.intentoPago;
    var montoEnCentavos = totalActual() * 100;
    var firma = null;

    Promise.all([cargarWompi(), verificarComercioWompi()]).then(function (resultados) {
      return obtenerFirmaIntegridad(referenciaPago, montoEnCentavos).then(function (integrity) {
        firma = integrity;
        return resultados[0];
      });
    }).then(function (WidgetCheckout) {
      var envio = datosEnvio();
      var config = {
        currency: 'COP',
        amountInCents: montoEnCentavos,
        reference: referenciaPago,
        signature: { integrity: firma },
        publicKey: WOMPI.publicKey,
        customerData: {
          fullName: envio.nombre,
          phoneNumber: envio.telefono,
          phoneNumberPrefix: '+57'
        },
        shippingAddress: {
          addressLine1: envio.direccion.slice(0, 100),
          addressLine2: ('Barrio ' + envio.barrio + (envio.indicaciones ? ' · ' + envio.indicaciones : '')).slice(0, 100),
          country: 'CO',
          region: envio.departamento,
          city: envio.ciudad,
          name: envio.nombre,
          phoneNumber: envio.telefono
        }
      };
      // Wompi solo acepta redirecciones a sitios públicos (no localhost)
      if (window.location.protocol === 'https:') config.redirectUrl = window.location.origin + window.location.pathname;

      try {
        sessionStorage.setItem('salva_pedido_actual', JSON.stringify({ ref: referenciaPago, envio: envio, color: descripcionColor(), modelo: NOMBRES_MODELO[modeloActual()], talla: descripcionTalla(), cloud: estadoCheckout.orderBump }));
      } catch (e) { /* almacenamiento no disponible */ }

      try {
        var checkout = new WidgetCheckout(config);
        checkout.open(manejarResultadoWompi);
        // El widget toma el control en su propia ventana: liberamos el botón
        setTimeout(function () { estadoBotonPago(false); }, 1200);
      } catch (error) {
        console.error('Wompi no pudo iniciar:', error);
        estadoBotonPago(false);
        mostrarFallbackPago('La pasarela no pudo iniciar el pago',
          'Wompi respondió con un error al abrir el formulario. Puedes reintentar o completar tu compra con un asesor; tu pedido ' + estadoCheckout.codigoPedido + ' ya tiene tus datos de entrega.');
      }
    }).catch(function (error) {
      var tipo = error && MENSAJES_FALLO_WOMPI[error.message] ? error.message : 'bloqueado';
      console.warn('Wompi no disponible:', tipo);
      estadoBotonPago(false);
      mostrarFallbackPago(MENSAJES_FALLO_WOMPI[tipo][0],
        MENSAJES_FALLO_WOMPI[tipo][1] + 'Tu pedido ' + estadoCheckout.codigoPedido +
        ' y tus datos de entrega están guardados: complétalo con un asesor por WhatsApp.');
    });

    return registro;
  }

  function manejarResultadoWompi(resultado) {
    var transaccion = resultado && resultado.transaction;
    estadoBotonPago(false);
    if (!transaccion) return; // El usuario cerró el widget sin pagar

    if (transaccion.status === 'APPROVED') {
      mostrarResultadoPago('aprobado', transaccion.reference || transaccion.id);
    } else if (transaccion.status === 'PENDING') {
      mostrarResultadoPago('pendiente', transaccion.reference || transaccion.id);
    } else {
      mostrarFallbackPago('El pago no fue aprobado',
        'La entidad financiera rechazó la transacción (' + transaccion.status + '). Puedes intentar con otro medio de pago o completar la compra con un asesor.');
    }
  }

  function mostrarResultadoPago(tipo, referencia, datosGuardados) {
    var datos = datosGuardados || {
      envio: datosEnvio(), color: descripcionColor(), modelo: NOMBRES_MODELO[modeloActual()], talla: descripcionTalla(),
      cloud: estadoCheckout.orderBump
    };
    var aprobado = tipo === 'aprobado';
    var icono = document.getElementById('checkoutResultadoIcono');
    icono.classList.toggle('pendiente', !aprobado);
    icono.innerHTML = aprobado
      ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    document.getElementById('checkoutResultadoTitulo').textContent = aprobado ? '¡Pago aprobado!' : 'Pago en verificación';
    document.getElementById('checkoutResultadoTexto').textContent = aprobado
      ? 'Gracias por proteger a los tuyos con Salva. Preparamos tu despacho de inmediato.'
      : 'Tu banco está confirmando la transacción. Te escribiremos por WhatsApp apenas se apruebe.';
    document.getElementById('checkoutResultadoRef').textContent = 'Referencia: ' + referencia;

    var detalle = document.getElementById('checkoutResultadoDetalle');
    detalle.innerHTML = '';
    var envio = datos.envio || {};
    [
      datos.modelo + ' · ' + datos.color + ' · ' + datos.talla + (datos.cloud ? ' + Salva Cloud Familiar (1 año)' : ''),
      'Entrega a: ' + envio.nombre + ' (+57 ' + envio.telefono + ')',
      envio.direccion + ', barrio ' + envio.barrio + ' — ' + envio.ciudad + ', ' + envio.departamento
    ].forEach(function (linea) {
      var p = document.createElement('p');
      p.textContent = linea;
      detalle.appendChild(p);
    });

    if (checkoutFormView) checkoutFormView.hidden = true;
    if (checkoutResultadoView) checkoutResultadoView.hidden = false;
    if (modalCompra && modalCompra.hidden) {
      modalCompra.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }

  if (checkoutPaso2) {
    checkoutPaso2.addEventListener('submit', function (e) {
      e.preventDefault();
      pagarConWompi();
    });
  }

  var btnReintentarWompi = document.getElementById('btnReintentarWompi');
  if (btnReintentarWompi) btnReintentarWompi.addEventListener('click', pagarConWompi);

  /* ---------- Retorno desde Wompi (PSE redirige con ?id=) ---------- */
  (function verificarRetornoWompi() {
    var params = new URLSearchParams(window.location.search);
    var idTransaccion = params.get('id');
    if (!idTransaccion) return;
    var guardado = null;
    try { guardado = JSON.parse(sessionStorage.getItem('salva_pedido_actual') || 'null'); } catch (e) { guardado = null; }
    if (!guardado) return;

    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    fetch(WOMPI.apiUrl + '/transactions/' + encodeURIComponent(idTransaccion))
      .then(function (res) { return res.json(); })
      .then(function (json) {
        var estadoTx = json && json.data ? json.data.status : '';
        if (estadoTx === 'APPROVED') mostrarResultadoPago('aprobado', guardado.ref, guardado);
        else if (estadoTx === 'PENDING') mostrarResultadoPago('pendiente', guardado.ref, guardado);
      })
      .catch(function () { /* sin conexión: el asesor confirmará por WhatsApp */ });
  })();

  /* ---------- Abrir / cerrar modal ---------- */
  function abrirModalCompra(opciones) {
    opciones = opciones || {};
    if (checkoutFormView) checkoutFormView.hidden = false;
    if (checkoutResultadoView) checkoutResultadoView.hidden = true;
    ocultarFallbackPago();
    estadoBotonPago(false);

    estadoCheckout.codigoPedido = nuevoCodigoPedido();
    estadoCheckout.intentoPago = 0;
    estadoCheckout.firmaPedidoRegistrado = null;
    aplicarOrderBump(false);

    seleccionarModelo(opciones.modelo || modeloActual());
    seleccionarColor(opciones.color || colorActual(), false);
    seleccionarTallaCheckout(opciones.talla || tallaActual());
    irAPaso(1);

    if (modalCompra) modalCompra.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function cerrarModalCompra() {
    if (modalCompra) modalCompra.hidden = true;
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-close-modal="modalCompra"]').forEach(function (btn) {
    btn.addEventListener('click', cerrarModalCompra);
  });
  if (modalCompra) {
    modalCompra.addEventListener('click', function (e) {
      if (e.target === modalCompra) cerrarModalCompra();
    });
  }

  document.querySelectorAll('.btn-abrir-asesoria, .btn-elegir-plan').forEach(function (btn) {
    btn.addEventListener('click', function () {
      abrirModalCompra({ modelo: btn.getAttribute('data-modelo') || 'band' });
    });
  });

  // Estado inicial de las vistas previas
  seleccionarColor(colorActual(), false);

  /* ---------- Membresía Salva Cloud Familiar (suscripción asistida) ---------- */
  var PLANES_CLOUD = {
    mensual: 'Mensual ($9.900 COP / mes, sin contrato)',
    anual: 'Anual ($79.000 COP / año, ahorro del 33%)'
  };
  document.querySelectorAll('.btn-cloud').forEach(function (btn) {
    var plan = PLANES_CLOUD[btn.getAttribute('data-cloud-plan')] || PLANES_CLOUD.mensual;
    var mensaje = '☁️ *SALVA CLOUD FAMILIAR*\nHola Asistente Salva, deseo activar la membresía ' + plan +
      '.\nCódigo de mi pulsera (si ya la tengo): ____\nPor favor envíenme el enlace de pago seguro.';
    btn.href = 'https://wa.me/' + NUMERO_WHATSAPP_VENTAS + '?text=' + encodeURIComponent(mensaje);
  });

  /* =========================================================
     CHATBOT WIDGET
     ========================================================= */
  var chatWidget = document.getElementById('chatWidget');
  var chatToggle = document.getElementById('chatToggle');
  var chatMessages = document.getElementById('chatMessages');
  var chatForm = document.getElementById('chatForm');
  var chatInput = document.getElementById('chatInput');

  if (chatToggle && chatWidget) {
    chatToggle.addEventListener('click', function () {
      var isOpen = chatWidget.classList.toggle('open');
      chatToggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen && chatMessages && chatMessages.children.length === 0) {
        agregarMensajeChat('¡Hola! 👋 Soy tu Asistente Virtual de Salva. Te ayudo a elegir el modelo ideal, el color de tu pulsera, resolver dudas sobre tallas o coordinar tu pedido y enlace de pago.', 'bot');
      }
    });
  }

  function agregarMensajeChat(texto, emisor) {
    if (!chatMessages) return;
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + emisor;
    // Permitir saltos de línea legibles
    bubble.innerHTML = texto.replace(/\n/g, '<br>');
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function normalizarTexto(texto) {
    return (texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[¿?¡!.,;:()\-_]/g, ' ')
      .trim();
  }

  var RESPUESTAS_CHAT = [
    {
      claves: ['mensual', 'mensualidad', 'cuota', 'cuotas', 'suscripcion', 'recurrente', 'mes a mes', 'pagar', 'cloud', 'membresia'],
      resp: 'Tu pulsera Salva es de pago único: funciona de por vida sin cuotas obligatorias. De forma opcional puedes activar Salva Cloud Familiar ($9.900 COP/mes o $79.000 COP/año): red de hasta 5 tutores a los que avisas con un toque, historial completo de escaneos, bóveda médica para exámenes y recetas, y 50% de descuento en reposición. Al comprar puedes añadir 1 año por solo $49.000 COP.'
    },
    {
      claves: ['modelo', 'modelos', 'diferencia', 'diferencias', 'cual', 'recomiendas', 'tipos', 'versiones', 'opciones'],
      resp: 'Todo nuestro hardware es 100% pasivo (sin baterías ni cargas):\n• Salva Band ($59.000 COP): pulsera de silicona médica con QR + chip NFC.\n• Salva Watch ($45.000 COP): pasador de acero 316L con QR para la correa de tu smartwatch (20 o 22 mm).\n• Pack Dúo Familiar ($89.000 COP): 1 Watch + 1 Band, ahorras $15.000.\nAl escanearse, quien te encuentre avisa a tu familia en 1 toque por WhatsApp con la ubicación del rescate.'
    },
    {
      claves: ['precio', 'costo', 'valor', 'cuanto', 'cuesta', 'vale', 'comprar', 'cotizar', 'inversion'],
      resp: 'Precios oficiales (pago único, sin mensualidades):\n• Salva Band: $59.000 COP\n• Salva Watch: $45.000 COP\n• Pack Dúo Familiar: $89.000 COP (antes $104.000)\nListos para despacho a toda Colombia.'
    },
    {
      claves: ['talla', 'tallas', 'medida', 'medir', 'tamano', 'muneca', 'cm'],
      resp: 'Salva Band viene en 3 tallas: Niños 16 cm, Estándar 20 cm y Adulto Grande 23.8 cm. Salva Watch se ajusta a correas de 20 mm o 22 mm (Apple Watch, Garmin, Galaxy Watch, Amazfit). Un asesor confirma la medida por WhatsApp antes de despachar.'
    },
    {
      claves: ['color', 'colores', 'negro', 'gris', 'azul', 'verde', 'bosque', 'rojo', 'rosa', 'titanio', 'placa', 'unibody', 'material', 'diseno', 'nombre', 'alergias'],
      resp: 'Salva tiene un diseño unibody en silicona médica disponible en 6 colores mate: Negro Obsidiana, Gris Titanio (grafito), Azul Marino Profundo, Verde Bosque, Rojo Carmesí y Rosa Coral. Puedes verlos en vivo en la sección de modelos. El emblema y el código QR quedan integrados al ras de la correa, sin piezas sueltas. Tu ficha digital (nombre, contacto SOS y alergia crítica) se actualiza cuando quieras desde tu celular, sin necesidad de grabado físico.'
    },
    {
      claves: ['smartwatch', 'reloj', 'apple watch', 'garmin', 'galaxy watch', 'amazfit', 'correa', 'pasador'],
      resp: 'Salva Watch es un pasador de acero 316L con QR grabado que se desliza en la correa de tu reloj (20 o 22 mm): Apple Watch, Garmin, Galaxy Watch, Amazfit o relojes tradicionales. No necesitas instalar nada en el reloj, y los WhatsApp que te envíen desde la ficha también aparecen en tu smartwatch.'
    },
    {
      claves: ['sos', 'panico', 'boton', 'emergencia', 'alerta', 'auxilio', 'rescate', 'ubicacion', 'gps'],
      resp: 'Al escanear tu Salva, la ficha médica captura las coordenadas GPS del celular que escaneó y habilita un botón directo de 1 solo toque para avisar a tu familia por WhatsApp con el enlace a Google Maps (o llamada directa), quedando registrado al instante en tu panel Salva.'
    },
    {
      claves: ['agua', 'piscina', 'lluvia', 'resistente', 'sumergible', 'mojar', 'ducha', 'ip68'],
      resp: '¡100% sumergible! Todas nuestras pulseras cuentan con certificación IP68: soportan agua, piscinas, duchas, lluvia, barro y el ritmo activo de los deportistas.'
    },
    {
      claves: ['ciclista', 'motero', 'moto', 'bici', 'bicicleta', 'ruta', 'rodada', 'carretera', 'soat'],
      resp: '¡Ideal para ciclistas y moteros! Con Salva Watch en la correa de tu reloj (o Salva Band en la muñeca), paramédicos y rescatistas escanean el QR y ven al instante tipo de sangre, EPS y póliza, y llaman a tu familia sin desbloquear tu teléfono.'
    },
    {
      claves: ['mayor', 'mayores', 'abuelo', 'abuela', 'padres', 'anciano', 'alzheimer', 'demencia'],
      resp: 'Para adultos mayores, Salva resguarda su historia clínica digital completa (hipertensión, diabetes, medicamentos) para que caminen con total autonomía y tranquilidad familiar.'
    },
    {
      claves: ['nino', 'nina', 'hijo', 'hija', 'parque', 'colegio', 'extravio', 'bebe'],
      resp: 'Para niños, si se alejan en un parque o centro comercial, cualquier persona o guardia puede escanear la pulsera para contactarte en 5 segundos.'
    },
    {
      claves: ['envio', 'entrega', 'domicilio', 'ciudades', 'bogota', 'medellin', 'cali', 'colombia'],
      resp: 'Hacemos envíos rápidos y seguros a toda Colombia. Te asesoramos directamente por WhatsApp antes del despacho.'
    }
  ];

  function procesarConsultaChat(pregunta) {
    agregarMensajeChat(pregunta, 'user');
    var normal = normalizarTexto(pregunta);
    var respuesta = 'Con gusto te asesoramos personalmente en minutos. Puedes escribirnos directamente a nuestro WhatsApp oficial: <a href="https://wa.me/573505208592?text=' + encodeURIComponent('Hola Salva, tengo una consulta: ' + pregunta) + '" target="_blank" style="color:#065F46;font-weight:700;text-decoration:underline;">+57 350 520 8592</a>.';

    for (var i = 0; i < RESPUESTAS_CHAT.length; i++) {
      var regla = RESPUESTAS_CHAT[i];
      var encontrado = false;
      for (var j = 0; j < regla.claves.length; j++) {
        var claveNormal = normalizarTexto(regla.claves[j]);
        if (normal.indexOf(claveNormal) !== -1) {
          respuesta = regla.resp;
          encontrado = true;
          break;
        }
      }
      if (encontrado) break;
    }

    setTimeout(function () {
      agregarMensajeChat(respuesta, 'bot');
    }, 350);
  }

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = chatInput.value.trim();
      if (!q) return;
      chatInput.value = '';
      procesarConsultaChat(q);
    });
  }

  document.querySelectorAll('#chatSuggestions button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var q = btn.getAttribute('data-q') || btn.textContent;
      procesarConsultaChat(q);
    });
  });

})();
