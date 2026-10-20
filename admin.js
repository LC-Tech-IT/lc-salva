/* =========================================================
   Salva — Desarrollado y respaldado por LC Tech
   Panel Administrativo
   admin.js
   
   Esquema oficial confirmado en Supabase:
     pulseras (id, codigo_qr, estado ['disponible'|'vinculada'],
               usuario_id, tipo_plan [heredado, ya no define funciones], created_at)
     portadores (id, nombre_completo, foto_url, tipo_sangre, alergias,
                 enfermedades_condiciones, medicamentos, eps_seguro,
                 contacto_emergencia_1_nombre, contacto_emergencia_1_telefono,
                 contacto_emergencia_2_nombre, contacto_emergencia_2_telefono,
                 notas_adicionales, fecha_nacimiento,
                 pulsera_id -> pulseras.id, usuario_id -> auth.users.id)
     escaneos_ubicacion (id, pulsera_id, latitud, longitud,
                         precision_metros, created_at)
     Hardware 100% pasivo (QR + NFC, sin batería ni GPS propio):
     lotes SALVA-B-xxxx = Salva Band (QR + NFC) · SALVA-W-xxxx = Salva Watch (QR)
     La ficha pública se lee con obtener_ficha_publica(); vincular y
     desvincular usan funciones seguras (20261017_privacidad_hardware_pasivo.sql).
     Salva Cloud Familiar (supabase/migrations/20261016_salva_cloud.sql):
       membresias_cloud (usuario_id, activa, plan, vence_en)
       red_tutores (id, usuario_id, nombre, parentesco, telefono, email, notificar_whatsapp)
       boveda_medica (id, portador_id, nombre, categoria, archivo_url -> bucket privado boveda_medica)
     El socorrista avisa a la familia en 1 toque (wa.me) desde la ficha. La Edge Function
     alerta-escaneo (envío automático) queda preparada pero NO activa.
     Paywall: el último escaneo es libre; la bitácora completa y la Red Multi-Tutor son Salva Cloud.
   ========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://bfxolduuqkrhyfjrvwsx.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_xcSIX2__GnOZ6vL7__BuOQ_pEQ5L-FJ';
  var supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  var BUCKET_FOTOS = 'fotos_portadores';
  // Catálogo físico: el tipo de producto se identifica por el prefijo del lote
  var PRODUCTOS = {
    band: { nombre: 'Salva Band', detalle: 'Pulsera · QR + NFC', lectura: 'Ficha médica por QR y NFC' },
    watch: { nombre: 'Salva Watch', detalle: 'Pasador smartwatch · QR', lectura: 'Ficha médica por QR' }
  };

  function productoDe(codigo) {
    return /^SALVA-W-/i.test(codigo || '') ? 'watch' : 'band';
  }

  // Acepta el código impreso o la URL completa del QR (…/ficha.html?qr=SALVA-B-0001)
  function normalizarCodigoPulsera(valor) {
    var texto = String(valor || '').trim();
    var enUrl = texto.match(/[?&]qr=([^&#]+)/i);
    if (enUrl) texto = decodeURIComponent(enUrl[1]);
    return texto.toUpperCase();
  }

  var MENSAJES_APROVISIONAMIENTO = {
    band: 'Salva Band vinculada: completa su ficha médica. Cada escaneo te avisará con la ubicación del rescate.',
    watch: 'Salva Watch vinculado: completa su ficha médica. Cada escaneo del QR te avisará con la ubicación del rescate.'
  };

  function rpcNoDisponible(error) {
    return !!error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''));
  }

  var estado = {
    usuario: null,
    modoRecuperacion: false,
    portadoresConPulsera: [],
    fotoUrlPendiente: null,
    fotoPortadorEditandoId: null,
    streamCamara: null,
    escaneando: false
  };

  /* =========================================================
     Utilidades: DOM
     ========================================================= */
  function el(id) { return document.getElementById(id); }

  /* =========================================================
     Toasts
     ========================================================= */
  var ICONOS_TOAST = { exito: '✅', error: '⚠️', carga: '⏳', info: 'ℹ️' };

  function mostrarToast(mensaje, tipo, duracionMs) {
    tipo = tipo || 'info';
    var contenedor = el('toastContainer');
    if (!contenedor) return function () {};
    var toast = document.createElement('div');
    toast.className = 'toast ' + tipo;
    toast.innerHTML =
      '<span class="toast-icon" aria-hidden="true">' + (ICONOS_TOAST[tipo] || 'ℹ️') + '</span>' +
      '<span class="toast-msg"></span>';
    toast.querySelector('.toast-msg').textContent = mensaje;
    contenedor.appendChild(toast);

    var descartado = false;
    function descartar() {
      if (descartado) return;
      descartado = true;
      toast.style.transition = 'opacity .2s ease, transform .2s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      setTimeout(function () { toast.remove(); }, 220);
    }

    if (tipo !== 'carga') {
      setTimeout(descartar, duracionMs || 4200);
    }
    return descartar;
  }

  /* =========================================================
     Validación de formularios en tiempo real
     ========================================================= */
  function mostrarErrorCampo(inputId, mensaje) {
    var input = el(inputId);
    var errorEl = document.querySelector('.field-error[data-for="' + inputId + '"]');
    if (input) input.classList.toggle('input-invalid', !!mensaje);
    if (errorEl) errorEl.textContent = mensaje || '';
  }

  function esEmailValido(valor) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor || '').trim());
  }

  function validarCampoEmail(inputId) {
    var input = el(inputId);
    if (!input) return false;
    var valor = input.value.trim();
    if (!valor) { mostrarErrorCampo(inputId, 'El correo es obligatorio.'); return false; }
    if (!esEmailValido(valor)) { mostrarErrorCampo(inputId, 'Ingresa un correo válido.'); return false; }
    mostrarErrorCampo(inputId, '');
    return true;
  }

  function validarCampoPassword(inputId) {
    var input = el(inputId);
    if (!input) return false;
    var valor = input.value;
    if (!valor) { mostrarErrorCampo(inputId, 'La contraseña es obligatoria.'); return false; }
    if (valor.length < 6) { mostrarErrorCampo(inputId, 'Mínimo 6 caracteres.'); return false; }
    mostrarErrorCampo(inputId, '');
    return true;
  }

  function validarCampoRequerido(inputId, mensaje) {
    var input = el(inputId);
    if (!input) return false;
    var valor = input.value.trim();
    if (!valor) { mostrarErrorCampo(inputId, mensaje); return false; }
    mostrarErrorCampo(inputId, '');
    return true;
  }

  function validarTelefono(inputId, requerido) {
    var input = el(inputId);
    if (!input) return false;
    var valor = input.value.trim();
    if (!valor) {
      if (requerido) { mostrarErrorCampo(inputId, 'El teléfono es obligatorio.'); return false; }
      mostrarErrorCampo(inputId, '');
      return true;
    }
    var digitos = valor.replace(/\D/g, '');
    if (digitos.length < 7 || digitos.length > 13) {
      mostrarErrorCampo(inputId, 'Ingresa un teléfono válido (7 a 13 dígitos).');
      return false;
    }
    mostrarErrorCampo(inputId, '');
    return true;
  }

  function activarValidacionEnVivo(inputId, validador) {
    var input = el(inputId);
    if (!input) return;
    input.addEventListener('blur', validador);
    input.addEventListener('input', function () {
      if (input.classList.contains('input-invalid')) validador();
    });
  }

  /* =========================================================
     Códigos de país
     ========================================================= */
  var CODIGOS_PAIS = [
    { code: '+57', label: '+57 Colombia' },
    { code: '+52', label: '+52 México' },
    { code: '+1', label: '+1 EE. UU. / Canadá' },
    { code: '+34', label: '+34 España' },
    { code: '+51', label: '+51 Perú' },
    { code: '+54', label: '+54 Argentina' },
    { code: '+56', label: '+56 Chile' },
    { code: '+593', label: '+593 Ecuador' },
    { code: '+58', label: '+58 Venezuela' },
    { code: '+55', label: '+55 Brasil' }
  ];

  function poblarSelectPais(selectId) {
    var select = el(selectId);
    if (!select) return;
    select.innerHTML = '';
    CODIGOS_PAIS.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.label;
      select.appendChild(opt);
    });
    select.value = '+57';
  }

  function dividirTelefono(telefonoCompleto) {
    if (!telefonoCompleto) return { codigo: '+57', numero: '' };
    var ordenados = CODIGOS_PAIS.slice().sort(function (a, b) { return b.code.length - a.code.length; });
    for (var i = 0; i < ordenados.length; i++) {
      if (telefonoCompleto.indexOf(ordenados[i].code) === 0) {
        return { codigo: ordenados[i].code, numero: telefonoCompleto.slice(ordenados[i].code.length) };
      }
    }
    return { codigo: '+57', numero: telefonoCompleto.replace(/\D/g, '') };
  }

  function combinarTelefono(codigo, numero) {
    var digitos = String(numero || '').replace(/\D/g, '');
    return digitos ? codigo + digitos : '';
  }

  /* =========================================================
     Modales genéricos
     ========================================================= */
  function abrirModal(id) {
    var modalEl = el(id);
    if (modalEl) {
      modalEl.hidden = false;
      document.body.style.overflow = 'hidden';
    }
  }
  function cerrarModal(id) {
    var modalEl = el(id);
    if (modalEl) {
      modalEl.hidden = true;
      document.body.style.overflow = '';
      if (id === 'modalVincular') detenerEscaneo();
    }
  }

  document.querySelectorAll('[data-close-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () { cerrarModal(btn.getAttribute('data-close-modal')); });
  });
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) cerrarModal(overlay.id);
    });
  });

  /* =========================================================
     Vistas: alternar entre carga / auth / app
     ========================================================= */
  function mostrarVistaCargando() {
    el('vistaCargandoSesion').hidden = false;
    el('vistaAuth').hidden = true;
    el('appHeader').hidden = true;
    el('vistaApp').hidden = true;
  }

  function mostrarVistaAuth() {
    el('vistaCargandoSesion').hidden = true;
    el('vistaAuth').hidden = false;
    el('appHeader').hidden = true;
    el('vistaApp').hidden = true;
  }

  function mostrarVistaApp() {
    el('vistaCargandoSesion').hidden = true;
    el('vistaAuth').hidden = true;
    el('appHeader').hidden = false;
    el('vistaApp').hidden = false;
  }

  /* =========================================================
     Autenticación: alternar formularios
     ========================================================= */
  function mostrarFormularioAuth(nombre) {
    ['formLogin', 'formRegistro', 'formOlvide', 'formNuevaContrasena'].forEach(function (id) {
      var f = el(id);
      if (f) f.hidden = (id !== nombre);
    });
    document.querySelectorAll('.auth-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-mode') === (nombre === 'formLogin' ? 'login' : 'registro'));
      tab.setAttribute('aria-selected', String(tab.classList.contains('active')));
    });
    el('authTabs').hidden = (nombre === 'formOlvide' || nombre === 'formNuevaContrasena');
  }

  document.querySelectorAll('.auth-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var modo = tab.getAttribute('data-mode');
      mostrarFormularioAuth(modo === 'login' ? 'formLogin' : 'formRegistro');
    });
  });

  el('linkOlvideContrasena').addEventListener('click', function () { mostrarFormularioAuth('formOlvide'); });
  el('btnVolverLogin').addEventListener('click', function () { mostrarFormularioAuth('formLogin'); });

  /* ---------- Login ---------- */
  activarValidacionEnVivo('loginEmail', function () { validarCampoEmail('loginEmail'); });
  activarValidacionEnVivo('loginPassword', function () { validarCampoPassword('loginPassword'); });

  el('formLogin').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validarCampoEmail('loginEmail') || !validarCampoPassword('loginPassword')) return;

    var boton = el('formLogin').querySelector('button[type="submit"]');
    boton.disabled = true;
    var cerrarCarga = mostrarToast('Iniciando sesión…', 'carga');

    supabase.auth.signInWithPassword({
      email: el('loginEmail').value.trim(),
      password: el('loginPassword').value
    }).then(function (res) {
      cerrarCarga();
      boton.disabled = false;
      if (res.error) {
        mostrarToast(res.error.message, 'error');
      }
    });
  });

  /* ---------- Registro ---------- */
  activarValidacionEnVivo('registroEmail', function () { validarCampoEmail('registroEmail'); });
  activarValidacionEnVivo('registroPassword', function () { validarCampoPassword('registroPassword'); });

  el('formRegistro').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validarCampoEmail('registroEmail') || !validarCampoPassword('registroPassword')) return;

    var p1 = el('registroPassword').value;
    var p2 = el('registroPasswordConfirm').value;
    if (p1 !== p2) {
      mostrarErrorCampo('registroPasswordConfirm', 'Las contraseñas no coinciden.');
      return;
    }

    var boton = el('formRegistro').querySelector('button[type="submit"]');
    boton.disabled = true;
    var cerrarCarga = mostrarToast('Creando cuenta…', 'carga');

    supabase.auth.signUp({
      email: el('registroEmail').value.trim(),
      password: p1
    }).then(function (res) {
      cerrarCarga();
      boton.disabled = false;
      if (res.error) {
        mostrarToast(res.error.message, 'error');
        return;
      }
      mostrarToast('¡Cuenta creada con éxito!', 'exito');
    });
  });

  /* ---------- Google Login ---------- */
  el('btnGoogleLogin').addEventListener('click', function () {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
  });

  /* ---------- Cerrar sesión ---------- */
  el('btnCerrarSesion').addEventListener('click', function () {
    detenerVigilancia();
    reiniciarSalvaCloud();
    supabase.auth.signOut().then(function () {
      mostrarToast('Sesión cerrada.', 'info');
      mostrarVistaAuth();
    });
  });

  /* ---------- Listener Auth State Change ---------- */
  if (supabase) {
    supabase.auth.onAuthStateChange(function (evento, sesion) {
      if (sesion && sesion.user) {
        estado.usuario = sesion.user;
        actualizarSaludo();
        mostrarVistaApp();
        cargarDashboard();
      } else {
        estado.usuario = null;
        mostrarVistaAuth();
      }
    });
  }

  function actualizarSaludo() {
    var correo = estado.usuario && estado.usuario.email ? estado.usuario.email : '';
    el('saludoUsuario').textContent = correo ? 'Hola, ' + correo : '';
  }

  /* =========================================================
     Dashboard: cargar y renderizar pulseras
     ========================================================= */
  function cargarDashboard() {
    el('dashboardSkeleton').hidden = false;
    el('gridPulseras').hidden = true;
    el('estadoVacio').hidden = true;

    supabase
      .from('portadores')
      .select('*, pulseras(*)')
      .eq('usuario_id', estado.usuario.id)
      .order('created_at', { ascending: false })
      .then(function (res) {
        el('dashboardSkeleton').hidden = true;

        if (res.error) {
          mostrarToast('Error al cargar tus pulseras: ' + res.error.message, 'error');
          el('estadoVacio').hidden = false;
          return;
        }

        estado.portadoresConPulsera = res.data || [];
        iniciarSalvaCloud();

        if (!estado.portadoresConPulsera.length) {
          el('estadoVacio').hidden = false;
          return;
        }

        renderizarPulseras();
        el('gridPulseras').hidden = false;
        iniciarVigilancia();
      });
  }

  function textoOAlternativa(valor, alternativa) {
    if (!valor) return alternativa;
    var texto = String(valor).trim();
    return texto ? texto : alternativa;
  }

  function funcionesProductoHtml(producto) {
    var cloud = usuarioTieneSalvaCloud();
    var filas = [
      { activa: true, texto: PRODUCTOS[producto].lectura },
      { activa: true, texto: 'Aviso del último escaneo con ubicación' },
      { activa: cloud, texto: 'Historial completo de escaneos', cloud: true },
      { activa: cloud, texto: 'Red Multi-Tutor (hasta 5)', cloud: true },
      { activa: cloud, texto: 'Bóveda Médica Cloud', cloud: true }
    ];
    return '<ul class="plan-funciones">' + filas.map(function (f) {
      return '<li class="' + (f.activa ? 'is-activa' : 'is-bloqueada') + '">' +
        '<span aria-hidden="true">' + (f.activa ? '✓' : '🔒') + '</span>' + f.texto +
        (f.activa ? '' : ' <a href="#" class="plan-mejorar" data-ir-cloud>Salva Cloud</a>') +
        '</li>';
    }).join('') + '</ul>';
  }

  function renderizarPulseras() {
    var grid = el('gridPulseras');
    grid.innerHTML = '';

    estado.portadoresConPulsera.forEach(function (portador) {
      var pulsera = portador.pulseras || {};
      var card = document.createElement('article');
      var producto = productoDe(pulsera.codigo_qr);
      card.className = 'pulsera-card pulsera-card--' + producto;

      var nombre = textoOAlternativa(portador.nombre_completo, 'Portador Seguro');
      var clasePlan = 'badge-producto-' + producto;
      var claseEstado = pulsera.estado === 'vinculada' ? 'badge-estado-vinculada' : 'badge-estado-disponible';

      card.innerHTML =
        '<div class="pulsera-card-top">' +
          (portador.foto_url
            ? '<img class="pulsera-avatar" src="' + portador.foto_url + '" alt="Foto de ' + escaparHtml(nombre) + '">'
            : '<div class="pulsera-avatar-fallback" aria-hidden="true">' + iconoAvatarSvg() + '</div>') +
          '<div class="pulsera-info">' +
            '<button type="button" class="pulsera-nombre-btn" title="Clic para ver Ficha Médica">' + escaparHtml(nombre) + '</button>' +
            '<p class="pulsera-codigo">ID: ' + (pulsera.codigo_qr || 'Sin QR') + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="pulsera-badges">' +
          '<span class="badge ' + clasePlan + '">' + PRODUCTOS[producto].nombre + ' · ' + PRODUCTOS[producto].detalle + '</span>' +
          '<span class="badge ' + claseEstado + '">' + (pulsera.estado === 'vinculada' ? 'Vinculada' : 'Disponible') + '</span>' +
        '</div>' +
        funcionesProductoHtml(producto) +
        '<div class="pulsera-card-actions">' +
          '<button type="button" class="btn btn-outline btn-sm btn-ver-ficha">👁️ Ver Ficha</button>' +
          '<button type="button" class="btn btn-primary btn-sm btn-editar">✏️ Editar Historia</button>' +
          '<button type="button" class="btn btn-outline btn-sm btn-desvincular" style="color:#DC2626; border-color:rgba(220,38,38,0.25);" title="Desvincular esta pulsera">🗑️ Desvincular</button>' +
        '</div>';

      // Eventos de interacción solicitados:
      // 1. Al dar clic sobre el nombre, avatar o botón "Ver Ficha" -> Muestra la Ficha Médica
      var verFichaHandler = function () { abrirPreviewFichaAdmin(portador); };
      card.querySelector('.pulsera-nombre-btn').addEventListener('click', verFichaHandler);
      var avatarEl = card.querySelector('.pulsera-avatar') || card.querySelector('.pulsera-avatar-fallback');
      if (avatarEl) avatarEl.addEventListener('click', verFichaHandler);
      card.querySelector('.btn-ver-ficha').addEventListener('click', verFichaHandler);

      // 2. Al dar clic en "Editar" -> Carga la Historia Clínica completa
      card.querySelector('.btn-editar').addEventListener('click', function () {
        abrirModalPortador(portador);
      });

      // 2b. Desvincular pulsera
      var btnDesvincular = card.querySelector('.btn-desvincular');
      if (btnDesvincular) {
        btnDesvincular.addEventListener('click', function () {
          if (!confirm('¿Deseas desvincular la pulsera ' + (pulsera.codigo_qr || '') + ' (' + nombre + ')? Podrás volver a vincularla cuando desees.')) return;
          desvincularPulsera(portador.id, pulsera.id);
        });
      }

      card.querySelectorAll('[data-ir-cloud]').forEach(function (enlace) {
        enlace.addEventListener('click', function (e) { e.preventDefault(); el('tabCloud').click(); });
      });

      grid.appendChild(card);
    });
  }

  function iconoAvatarSvg() {
    return '<svg viewBox="0 0 48 48" width="30" height="30"><circle cx="24" cy="17" r="9" fill="none" stroke="#6B8F7B" stroke-width="3"/><path d="M6 42c0-10 8-18 18-18s18 8 18 18" fill="none" stroke="#6B8F7B" stroke-width="3" stroke-linecap="round"/></svg>';
  }

  function escaparHtml(texto) {
    var div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  /* =========================================================
     VISTA PREVIA DE FICHA MÉDICA EN ADMIN (Al dar clic en Nombre)
     ========================================================= */
  function abrirPreviewFichaAdmin(portador) {
    var pulsera = portador.pulseras || {};
    var nombre = textoOAlternativa(portador.nombre_completo, 'Portador Seguro');

    el('previewNombrePortador').textContent = nombre;
    el('previewCodigoQr').textContent = 'Código QR / NFC: ' + (pulsera.codigo_qr || 'SALVA-0000');
    var productoPreview = productoDe(pulsera.codigo_qr);
    el('previewBadgePlan').textContent = PRODUCTOS[productoPreview].nombre;
    el('previewBadgePlan').className = 'badge badge-producto-' + productoPreview;

    el('previewSangre').textContent = textoOAlternativa(portador.tipo_sangre, 'No registrado');
    el('previewEps').textContent = textoOAlternativa(portador.eps_seguro, 'Sin EPS');
    el('previewAlergias').textContent = textoOAlternativa(portador.alergias, 'Sin alergias registradas.');
    el('previewCondiciones').textContent = textoOAlternativa(portador.enfermedades_condiciones, 'Sin condiciones o patologías reportadas.');
    el('previewMedicamentos').textContent = 'Medicamentos: ' + textoOAlternativa(portador.medicamentos, 'Ninguno registrado.');

    var fotoImg = el('previewFoto');
    var fotoFallback = el('previewFotoFallback');
    if (portador.foto_url) {
      fotoImg.src = portador.foto_url;
      fotoImg.hidden = false;
      fotoFallback.hidden = true;
    } else {
      fotoImg.hidden = true;
      fotoFallback.hidden = false;
    }

    var listContactos = el('previewContactosList');
    listContactos.innerHTML = '';
    if (portador.contacto_emergencia_1_telefono) {
      listContactos.innerHTML += '<div>📞 <strong>' + textoOAlternativa(portador.contacto_emergencia_1_nombre, 'Tutor Principal') + ':</strong> ' + portador.contacto_emergencia_1_telefono + '</div>';
    }
    if (portador.contacto_emergencia_2_telefono) {
      listContactos.innerHTML += '<div>📱 <strong>' + textoOAlternativa(portador.contacto_emergencia_2_nombre, 'Contacto Secundario') + ':</strong> ' + portador.contacto_emergencia_2_telefono + '</div>';
    }
    if (!portador.contacto_emergencia_1_telefono && !portador.contacto_emergencia_2_telefono) {
      listContactos.innerHTML = '<span style="color:var(--text-muted);">Sin contactos SOS registrados.</span>';
    }

    // Enlace a la Ficha Pública real
    var qrParam = pulsera.codigo_qr || pulsera.id || '';
    el('previewEnlacePublico').href = 'ficha.html' + (qrParam ? '?qr=' + encodeURIComponent(qrParam) : '');

    // Botón de editar desde la vista previa
    el('previewBtnEditar').onclick = function () {
      cerrarModal('modalFichaAdminPreview');
      abrirModalPortador(portador);
    };

    abrirModal('modalFichaAdminPreview');
  }

  el('btnVincularPulsera').addEventListener('click', function () {
    el('formVincular').reset();
    mostrarErrorCampo('codigoQrInput', '');
    abrirModal('modalVincular');
  });

  /* =========================================================
     Vincular nueva pulsera
     ========================================================= */
  el('formVincular').addEventListener('submit', function (e) {
    e.preventDefault();
    var codigo = normalizarCodigoPulsera(el('codigoQrInput').value);
    if (!codigo) { mostrarErrorCampo('codigoQrInput', 'Ingresa el código de la pulsera.'); return; }
    mostrarErrorCampo('codigoQrInput', '');
    vincularPulsera(codigo);
  });

  function vincularPulsera(codigo) {
    var boton = el('btnSubmitVincular');
    boton.disabled = true;
    var cerrarCarga = mostrarToast('Verificando código…', 'carga');

    supabase.rpc('vincular_pulsera', { p_codigo_qr: codigo }).then(function (res) {
      if (rpcNoDisponible(res.error)) {
        vincularPulseraLegado(codigo, boton, cerrarCarga);
        return;
      }
      cerrarCarga();
      boton.disabled = false;
      if (res.error) {
        mostrarErrorCampo('codigoQrInput', res.error.message);
        return;
      }
      finalizarVinculacion(res.data.portador, res.data.pulsera);
    });
  }

  function finalizarVinculacion(portadorNuevo, pulsera) {
    mostrarToast(MENSAJES_APROVISIONAMIENTO[productoDe(pulsera.codigo_qr)], 'exito', 6000);
    cerrarModal('modalVincular');
    cargarDashboard();
    portadorNuevo.pulseras = { id: pulsera.id, codigo_qr: pulsera.codigo_qr, estado: 'vinculada', tipo_plan: pulsera.tipo_plan };
    abrirModalPortador(portadorNuevo);
  }

  // Solo si la migración de privacidad aún no se ha ejecutado en Supabase
  function vincularPulseraLegado(codigo, boton, cerrarCarga) {
    supabase
      .from('pulseras')
      .select('id, estado, tipo_plan, codigo_qr')
      .eq('codigo_qr', codigo)
      .maybeSingle()
      .then(function (res) {
        if (res.error) {
          cerrarCarga();
          boton.disabled = false;
          mostrarToast('Error al verificar: ' + res.error.message, 'error');
          return;
        }

        var pulsera = res.data;
        if (!pulsera) {
          cerrarCarga();
          boton.disabled = false;
          mostrarErrorCampo('codigoQrInput', 'No encontramos una pulsera con ese código.');
          return;
        }
        if (pulsera.estado && pulsera.estado !== 'disponible') {
          cerrarCarga();
          boton.disabled = false;
          mostrarErrorCampo('codigoQrInput', 'Esta pulsera ya está vinculada a una cuenta.');
          return;
        }

        supabase
          .from('portadores')
          .insert({
            pulsera_id: pulsera.id,
            usuario_id: estado.usuario.id,
            nombre_completo: 'Nuevo Portador',
            contacto_emergencia_1_nombre: 'Contacto Principal',
            contacto_emergencia_1_telefono: '0000000000'
          })
          .select()
          .single()
          .then(function (resPortador) {
            if (resPortador.error) {
              cerrarCarga();
              boton.disabled = false;
              mostrarToast('No se pudo vincular: ' + resPortador.error.message, 'error');
              return;
            }

            supabase
              .from('pulseras')
              .update({ estado: 'vinculada' })
              .eq('id', pulsera.id)
              .then(function (resUpdate) {
                cerrarCarga();
                boton.disabled = false;
                finalizarVinculacion(resPortador.data, pulsera);
              });
          });
      });
  }

  /* ---------- Escaneo de QR con cámara (jsQR) ---------- */
  el('btnEscanear').addEventListener('click', iniciarEscaneo);
  el('btnDetenerEscaneo').addEventListener('click', detenerEscaneo);

  function iniciarEscaneo() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      mostrarToast('Tu navegador no admite cámara.', 'error');
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function (stream) {
        estado.streamCamara = stream;
        var video = el('videoEscaner');
        video.srcObject = stream;
        el('escanerContenedor').hidden = false;
        el('btnEscanear').hidden = true;
        return video.play();
      })
      .then(function () {
        estado.escaneando = true;
        requestAnimationFrame(tickEscaneo);
      })
      .catch(function () {
        mostrarToast('No se pudo acceder a la cámara.', 'error');
      });
  }

  function tickEscaneo() {
    if (!estado.escaneando) return;
    var video = el('videoEscaner');
    var canvas = el('canvasEscaner');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var codigo = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height) : null;

      if (codigo && codigo.data) {
        el('codigoQrInput').value = normalizarCodigoPulsera(codigo.data);
        mostrarToast('Código detectado.', 'exito');
        detenerEscaneo();
        return;
      }
    }
    requestAnimationFrame(tickEscaneo);
  }

  function detenerEscaneo() {
    estado.escaneando = false;
    if (estado.streamCamara) {
      estado.streamCamara.getTracks().forEach(function (t) { t.stop(); });
      estado.streamCamara = null;
    }
    el('escanerContenedor').hidden = true;
    el('btnEscanear').hidden = false;
  }

  /* =========================================================
     Editar portador & Historia Clínica
     ========================================================= */
  poblarSelectPais('contactoPrincipalPais');
  poblarSelectPais('contactoSecundarioPais');

  function abrirModalPortador(portador) {
    el('formPortador').reset();
    ['nombreCompleto', 'fechaNacimiento', 'tipoSangre', 'contactoPrincipalNombre', 'contactoPrincipalTelefono']
      .forEach(function (id) { mostrarErrorCampo(id, ''); });

    el('portadorId').value = portador.id;
    el('portadorPulseraId').value = portador.pulsera_id || (portador.pulseras && portador.pulseras.id) || '';

    el('nombreCompleto').value = portador.nombre_completo === 'Nuevo Portador' ? '' : (portador.nombre_completo || '');
    el('fechaNacimiento').value = portador.fecha_nacimiento || '';
    el('tipoSangre').value = portador.tipo_sangre || '';
    el('epsSeguro').value = portador.eps_seguro || '';
    el('alergias').value = portador.alergias || '';
    el('enfermedades').value = portador.enfermedades_condiciones || '';
    el('medicamentos').value = portador.medicamentos || '';
    el('notasAdicionales').value = portador.notas_adicionales || '';

    var principal = dividirTelefono(portador.contacto_emergencia_1_telefono);
    el('contactoPrincipalNombre').value = portador.contacto_emergencia_1_nombre || '';
    el('contactoPrincipalPais').value = principal.codigo;
    el('contactoPrincipalTelefono').value = principal.numero;

    var secundario = dividirTelefono(portador.contacto_emergencia_2_telefono);
    el('contactoSecundarioNombre').value = portador.contacto_emergencia_2_nombre || '';
    el('contactoSecundarioPais').value = secundario.codigo;
    el('contactoSecundarioTelefono').value = secundario.numero;

    var pulseraVinculada = portador.pulseras || {};
    actualizarIndicadorModelo(productoDe(pulseraVinculada.codigo_qr));
    seleccionarTalla('unica'); // Salva Band: talla única ajustable

    estado.fotoUrlPendiente = portador.foto_url || null;
    estado.fotoPortadorEditandoId = portador.id;
    actualizarPreviewFoto(portador.foto_url);

    abrirModal('modalPortador');
  }

  function actualizarIndicadorModelo(producto) {
    document.querySelectorAll('#modeloIndicador .modelo-opcion').forEach(function (opcion) {
      opcion.classList.toggle('active', opcion.getAttribute('data-modelo') === producto);
    });
  }

  function seleccionarTalla(talla) {
    el('tallaManilla').value = talla;
    document.querySelectorAll('#tallaSelector .talla-opcion').forEach(function (opcion) {
      opcion.classList.toggle('active', opcion.getAttribute('data-talla') === String(talla));
    });
  }

  document.querySelectorAll('#tallaSelector .talla-opcion').forEach(function (opcion) {
    opcion.addEventListener('click', function () { seleccionarTalla(opcion.getAttribute('data-talla')); });
  });

  function actualizarPreviewFoto(url) {
    var img = el('fotoPreviewImg');
    var fallback = el('fotoPreviewFallback');
    if (url) {
      img.src = url;
      img.hidden = false;
      fallback.hidden = true;
    } else {
      img.hidden = true;
      fallback.hidden = false;
    }
  }

  activarValidacionEnVivo('nombreCompleto', function () { validarCampoRequerido('nombreCompleto', 'El nombre es obligatorio.'); });
  activarValidacionEnVivo('fechaNacimiento', function () { validarCampoRequerido('fechaNacimiento', 'La fecha de nacimiento es obligatoria.'); });
  activarValidacionEnVivo('tipoSangre', function () { validarCampoRequerido('tipoSangre', 'Selecciona el tipo de sangre.'); });
  activarValidacionEnVivo('contactoPrincipalNombre', function () { validarCampoRequerido('contactoPrincipalNombre', 'El nombre del tutor es obligatorio.'); });
  activarValidacionEnVivo('contactoPrincipalTelefono', function () { validarTelefono('contactoPrincipalTelefono', true); });
  activarValidacionEnVivo('contactoSecundarioTelefono', function () { validarTelefono('contactoSecundarioTelefono', false); });

  /* ---------- Subida de foto a Supabase Storage ---------- */
  el('fotoInput').addEventListener('change', function () {
    var archivo = el('fotoInput').files[0];
    if (!archivo) return;

    var urlLocal = URL.createObjectURL(archivo);
    actualizarPreviewFoto(urlLocal);

    var cerrarCarga = mostrarToast('Subiendo foto del portador…', 'carga');
    var rutaArchivo = estado.usuario.id + '/' + (estado.fotoPortadorEditandoId || 'nuevo') + '-' + Date.now() + '.jpg';

    supabase.storage.from(BUCKET_FOTOS).upload(rutaArchivo, archivo, { upsert: true, cacheControl: '3600', contentType: archivo.type })
      .then(function (res) {
        cerrarCarga();
        if (res.error) {
          mostrarToast('Error al subir foto: ' + res.error.message, 'error');
          return;
        }
        var publica = supabase.storage.from(BUCKET_FOTOS).getPublicUrl(rutaArchivo);
        estado.fotoUrlPendiente = publica.data.publicUrl;
        mostrarToast('Foto actualizada correctamente.', 'exito');
      });
  });

  /* ---------- Guardar Historia Clínica & Ficha Médica ---------- */
  el('formPortador').addEventListener('submit', function (e) {
    e.preventDefault();

    var valido = true;
    valido = validarCampoRequerido('nombreCompleto', 'El nombre es obligatorio.') && valido;
    valido = validarCampoRequerido('fechaNacimiento', 'La fecha de nacimiento es obligatoria.') && valido;
    valido = validarCampoRequerido('tipoSangre', 'Selecciona el tipo de sangre.') && valido;
    valido = validarCampoRequerido('contactoPrincipalNombre', 'El nombre del tutor es obligatorio.') && valido;
    valido = validarTelefono('contactoPrincipalTelefono', true) && valido;
    valido = validarTelefono('contactoSecundarioTelefono', false) && valido;
    if (!valido) {
      mostrarToast('Revisa los campos requeridos en rojo.', 'error');
      return;
    }

    var boton = el('btnGuardarPortador');
    boton.disabled = true;
    var cerrarCarga = mostrarToast('Guardando Historia Clínica…', 'carga');

    var payload = {
      nombre_completo: el('nombreCompleto').value.trim(),
      fecha_nacimiento: el('fechaNacimiento').value,
      tipo_sangre: el('tipoSangre').value,
      eps_seguro: el('epsSeguro').value.trim(),
      alergias: el('alergias').value.trim(),
      enfermedades_condiciones: el('enfermedades').value.trim(),
      medicamentos: el('medicamentos').value.trim(),
      notas_adicionales: el('notasAdicionales').value.trim(),
      contacto_emergencia_1_nombre: el('contactoPrincipalNombre').value.trim(),
      contacto_emergencia_1_telefono: combinarTelefono(el('contactoPrincipalPais').value, el('contactoPrincipalTelefono').value),
      contacto_emergencia_2_nombre: el('contactoSecundarioNombre').value.trim(),
      contacto_emergencia_2_telefono: combinarTelefono(el('contactoSecundarioPais').value, el('contactoSecundarioTelefono').value),
      foto_url: estado.fotoUrlPendiente
    };

    guardarPortador(payload, el('portadorId').value, boton, cerrarCarga);
  });

  function guardarPortador(payload, portadorId, boton, cerrarCarga) {
    supabase
      .from('portadores')
      .update(payload)
      .eq('id', portadorId)
      .then(function (res) {
        cerrarCarga();
        boton.disabled = false;
        if (res.error) {
          mostrarToast('No se pudieron guardar los cambios: ' + res.error.message, 'error');
          return;
        }
        mostrarToast('¡Historia clínica y ficha médica actualizadas con éxito!', 'exito');
        cerrarModal('modalPortador');
        cargarDashboard();
      });
  }

  function desvincularPulsera(portadorId, pulseraId) {
    var cerrarCarga = mostrarToast('Desvinculando pulsera...', 'carga');
    supabase.rpc('desvincular_pulsera', { p_pulsera_id: pulseraId }).then(function (res) {
      if (rpcNoDisponible(res.error)) { desvincularPulseraLegado(portadorId, pulseraId, cerrarCarga); return; }
      cerrarCarga();
      if (res.error) { mostrarToast('Error al desvincular: ' + res.error.message, 'error'); return; }
      mostrarToast('Pulsera desvinculada exitosamente.', 'exito');
      cargarDashboard();
    });
  }

  function desvincularPulseraLegado(portadorId, pulseraId, cerrarCarga) {
    supabase
      .from('portadores')
      .delete()
      .eq('id', portadorId)
      .then(function (res) {
        if (res.error) {
          cerrarCarga();
          mostrarToast('Error al desvincular: ' + res.error.message, 'error');
          return;
        }
        if (pulseraId) {
          supabase
            .from('pulseras')
            .update({ estado: 'disponible' })
            .eq('id', pulseraId)
            .then(function () {});
        }
        cerrarCarga();
        mostrarToast('Pulsera desvinculada exitosamente.', 'exito');
        cargarDashboard();
      });
  }

  /* =========================================================
     Pestañas de la app: Mis Pulseras / Alertas y Geolocalización
     ========================================================= */
  document.querySelectorAll('#appTabs .app-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('#appTabs .app-tab').forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      var destino = tab.getAttribute('data-tab');
      el('panelPulseras').hidden = destino !== 'pulseras';
      el('panelAlertas').hidden = destino !== 'alertas';
      el('panelCloud').hidden = destino !== 'cloud';
      if (destino === 'cloud') mostrarPanelCloud();

      if (destino === 'alertas') {
        vigilancia.pendientes = 0;
        el('contadorAlertas').hidden = true;
        cargarAlertas();
      }
    });
  });

  /* =========================================================
     Historial de escaneos (todas las pulseras) con ubicación del rescate
     ========================================================= */
  function cargarAlertas() {
    el('alertasSkeleton').hidden = false;
    el('alertasVacio').hidden = true;
    el('alertasLista').hidden = true;

    var pulserasConGps = {};
    estado.portadoresConPulsera.forEach(function (portador) {
      var pulsera = portador.pulseras;
      if (pulsera && pulsera.id) {
        pulserasConGps[pulsera.id] = {
          codigo_qr: pulsera.codigo_qr,
          nombrePortador: textoOAlternativa(portador.nombre_completo, 'Portador Seguro')
        };
      }
    });

    var idsPulseras = Object.keys(pulserasConGps);
    if (!idsPulseras.length) {
      el('alertasSkeleton').hidden = true;
      el('alertasVacioTitulo').textContent = 'Aún no tienes pulseras vinculadas.';
      el('alertasVacioSub').textContent = 'Vincula tu Salva Band o Salva Watch para ver aquí cada escaneo con su ubicación.';
      el('alertasVacio').hidden = false;
      return;
    }

    // Libre: el último escaneo con su mapa. Salva Cloud: la bitácora completa.
    var bitacoraCompleta = usuarioTieneSalvaCloud();
    el('tituloHistorial').textContent = bitacoraCompleta
      ? 'Historial completo de escaneos y ubicación del rescate'
      : 'Último escaneo y ubicación del rescate';

    supabase
      .from('escaneos_ubicacion')
      .select('*')
      .in('pulsera_id', idsPulseras)
      .order('created_at', { ascending: false })
      .limit(bitacoraCompleta ? 50 : 1)
      .then(function (res) {
        el('alertasSkeleton').hidden = true;

        if (res.error) {
          mostrarToast('No se pudieron cargar las alertas: ' + res.error.message, 'error');
          el('alertasVacio').hidden = false;
          return;
        }

        var escaneos = res.data || [];
        if (!escaneos.length) {
          el('alertasVacioTitulo').textContent = 'Aún no hay escaneos registrados.';
          el('alertasVacioSub').textContent = 'Cuando alguien escanee tu Salva, verás aquí la fecha, la hora y la ubicación del rescate.';
          el('alertasVacio').hidden = false;
          return;
        }

        renderizarAlertas(escaneos, pulserasConGps);
        if (!bitacoraCompleta) agregarAvisoBitacoraCloud();
        el('alertasLista').hidden = false;
      });
  }

  function agregarAvisoBitacoraCloud() {
    var aviso = document.createElement('div');
    aviso.className = 'bitacora-bloqueada';
    var texto = document.createElement('p');
    texto.innerHTML = '🔒 <strong>Historial completo de escaneos</strong>: consulta la bitácora de todos los rescates con fecha, hora y mapa activando Salva Cloud Familiar.';
    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-primary btn-sm';
    boton.textContent = 'Ver Salva Cloud';
    boton.addEventListener('click', function () { el('tabCloud').click(); });
    aviso.appendChild(texto);
    aviso.appendChild(boton);
    el('alertasLista').appendChild(aviso);
  }

  function renderizarAlertas(escaneos, pulserasConGps) {
    var contenedor = el('alertasLista');
    contenedor.innerHTML = '';

    escaneos.forEach(function (escaneo, indice) {
      var infoPulsera = pulserasConGps[escaneo.pulsera_id] || {};
      var item = document.createElement('div');
      item.className = 'pulsera-card';
      item.style.marginBottom = '14px';

      var fecha = new Date(escaneo.created_at);
      var fechaTexto = isNaN(fecha.getTime()) ? escaneo.created_at : fecha.toLocaleString('es-ES', {
        dateStyle: 'medium', timeStyle: 'medium'
      });

      var tienePosicion = typeof escaneo.latitud === 'number' && typeof escaneo.longitud === 'number';
      var precisionTexto = escaneo.precision_metros ? ('Precisión: ± ' + Math.round(escaneo.precision_metros) + ' m') : '';
      var fuente = infoPulsera.nombrePortador
        ? infoPulsera.nombrePortador + ' · ' + (infoPulsera.codigo_qr || '')
        : (infoPulsera.codigo_qr || 'Pulsera');

      item.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">' +
          '<div>' +
            '<strong style="font-size:1.05rem; color:var(--text-dark); display:block;">📍 ' + escaparHtml(fuente) + '</strong>' +
            '<span style="font-size:0.85rem; color:var(--text-muted);">' + fechaTexto + ' · ' + precisionTexto + '</span>' +
          '</div>' +
          (tienePosicion ? '<a href="https://www.google.com/maps?q=' + escaneo.latitud + ',' + escaneo.longitud + '" class="btn btn-outline btn-sm" target="_blank" rel="noopener">🗺️ Abrir en Google Maps</a>' : '<span class="historial-sin-gps">Ubicación no compartida por quien escaneó</span>') +
        '</div>' +
        (tienePosicion && indice === 0 ? '<div class="alerta-mapa historial-mapa"></div>' : '');

      contenedor.appendChild(item);
      var mapa = item.querySelector('.historial-mapa');
      if (mapa) {
        var iframe = document.createElement('iframe');
        iframe.src = 'https://maps.google.com/maps?q=' + escaneo.latitud + ',' + escaneo.longitud + '&z=16&output=embed';
        iframe.title = 'Ubicación del último escaneo';
        iframe.loading = 'lazy';
        mapa.appendChild(iframe);
      }
    });
  }

  /* =========================================================
     AVISOS: sonido, vibración y notificaciones del navegador
     ========================================================= */
  var audio = { ctx: null };

  function contextoAudio() {
    if (!audio.ctx) {
      var Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return null;
      audio.ctx = new Contexto();
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return audio.ctx;
  }

  // Los navegadores solo permiten audio tras una interacción: lo desbloqueamos en el primer toque
  document.addEventListener('click', function () { contextoAudio(); }, { once: true });

  function tono(frecuencia, duracion, retraso) {
    var ctx = contextoAudio();
    if (!ctx) return;
    var inicio = ctx.currentTime + (retraso || 0);
    var osc = ctx.createOscillator();
    var ganancia = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frecuencia;
    ganancia.gain.setValueAtTime(0.0001, inicio);
    ganancia.gain.exponentialRampToValueAtTime(0.16, inicio + 0.02);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
    osc.connect(ganancia);
    ganancia.connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + duracion + 0.05);
  }

  function sonidoEscaneo() {
    tono(880, 0.18, 0);
    tono(1175, 0.22, 0.22);
    tono(880, 0.18, 0.6);
    tono(1175, 0.22, 0.82);
  }

  function vibrar(patron) {
    if (navigator.vibrate) {
      try { navigator.vibrate(patron); } catch (e) { /* sin soporte háptico */ }
    }
  }

  function notificarNavegador(titulo, cuerpo, etiqueta) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(titulo, { body: cuerpo, icon: 'salva-emblem.jpg', tag: etiqueta, requireInteraction: true });
    } catch (e) {
      // Chrome Android exige Service Worker para notificaciones: el aviso en pantalla y el sonido se mantienen
    }
  }

  function actualizarBotonAvisos() {
    var boton = el('btnActivarAvisos');
    if (!boton) return;
    var concedido = 'Notification' in window && Notification.permission === 'granted';
    boton.textContent = concedido ? '🔔 Sonido y notificaciones activos' : '🔔 Activar sonido y notificaciones';
    boton.classList.toggle('is-activo', concedido);
  }

  el('btnActivarAvisos').addEventListener('click', function () {
    contextoAudio();
    sonidoEscaneo();
    if (!('Notification' in window)) {
      mostrarToast('Tu navegador no admite notificaciones; los avisos sonarán dentro del panel.', 'info');
      return;
    }
    Notification.requestPermission().then(function (permiso) {
      actualizarBotonAvisos();
      mostrarToast(permiso === 'granted'
        ? 'Avisos activados: te alertaremos aunque estés en otra pestaña.'
        : 'Notificaciones bloqueadas. Los avisos seguirán sonando dentro del panel.', permiso === 'granted' ? 'exito' : 'info');
    });
  });
  actualizarBotonAvisos();

  function urlMapa(lat, lng) {
    return 'https://www.google.com/maps?q=' + lat + ',' + lng;
  }

  function pintarMapa(contenedorId, lat, lng) {
    var contenedor = el(contenedorId);
    contenedor.innerHTML = '';
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      contenedor.hidden = true;
      return;
    }
    var iframe = document.createElement('iframe');
    iframe.src = 'https://maps.google.com/maps?q=' + lat + ',' + lng + '&z=17&output=embed';
    iframe.title = 'Mapa de la ubicación';
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    contenedor.appendChild(iframe);
    contenedor.hidden = false;
  }

  /* =========================================================
     VIGILANCIA EN TIEMPO REAL DE ESCANEOS (todas las pulseras)
     Supabase Realtime + sondeo de respaldo cada 15 s
     ========================================================= */
  var vigilancia = { canal: null, intervalo: null, vistos: {}, marca: null, pulseras: {}, pendientes: 0 };

  function pulserasConAvisoEscaneo() {
    var mapa = {};
    estado.portadoresConPulsera.forEach(function (portador) {
      var pulsera = portador.pulseras;
      if (pulsera && pulsera.id) {
        mapa[pulsera.id] = {
          nombre: textoOAlternativa(portador.nombre_completo, 'Portador Seguro'),
          codigo: pulsera.codigo_qr
        };
      }
    });
    return mapa;
  }

  function estadoVigilancia(tipo) {
    var total = Object.keys(vigilancia.pulseras).length;
    var textos = {
      inactivo: ['Vigilancia de escaneos inactiva', 'Vincula tu Salva Band o Salva Watch para recibir aquí cada escaneo con su ubicación.'],
      conectando: ['Conectando vigilancia…', 'Estableciendo canal seguro con el servidor.'],
      'tiempo-real': ['Vigilancia en tiempo real activa', total + (total === 1 ? ' Salva protegida' : ' Salva protegidas') + ' · verás cada escaneo y su ubicación al instante.'],
      sondeo: ['Vigilancia activa', total + (total === 1 ? ' Salva protegida' : ' Salva protegidas') + ' · revisión automática cada 15 segundos.']
    };
    el('vigilanciaDot').setAttribute('data-estado', tipo);
    el('vigilanciaTitulo').textContent = textos[tipo][0];
    el('vigilanciaDetalle').textContent = textos[tipo][1];
  }

  function iniciarVigilancia() {
    detenerVigilancia();
    vigilancia.pulseras = pulserasConAvisoEscaneo();
    var ids = Object.keys(vigilancia.pulseras);
    if (!ids.length || !supabase) {
      estadoVigilancia('inactivo');
      return;
    }
    estadoVigilancia('conectando');

    // Punto de partida: el último escaneo ya existente no dispara alerta
    supabase
      .from('escaneos_ubicacion')
      .select('id, created_at')
      .in('pulsera_id', ids)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(function (res) {
        var ultimo = res.data && res.data[0];
        vigilancia.marca = ultimo ? ultimo.created_at : new Date().toISOString();
        if (ultimo) vigilancia.vistos[ultimo.id] = true;
      });

    vigilancia.canal = supabase
      .channel('salva-escaneos-' + estado.usuario.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'escaneos_ubicacion',
        filter: 'pulsera_id=in.(' + ids.join(',') + ')'
      }, function (cambio) { procesarEscaneoNuevo(cambio.new); });

    vigilancia.canal.subscribe(function (estadoCanal) {
        if (estadoCanal === 'SUBSCRIBED') estadoVigilancia('tiempo-real');
        else if (estadoCanal === 'CHANNEL_ERROR' || estadoCanal === 'TIMED_OUT') estadoVigilancia('sondeo');
      });

    // Respaldo: si Realtime no está habilitado en la tabla, el sondeo garantiza el aviso
    vigilancia.intervalo = setInterval(sondearEscaneos, 15000);
  }

  function detenerVigilancia() {
    if (vigilancia.canal && supabase) supabase.removeChannel(vigilancia.canal);
    if (vigilancia.intervalo) clearInterval(vigilancia.intervalo);
    vigilancia.canal = null;
    vigilancia.intervalo = null;
  }

  function sondearEscaneos() {
    var ids = Object.keys(vigilancia.pulseras);
    if (!vigilancia.marca || !ids.length) return;
    supabase
      .from('escaneos_ubicacion')
      .select('*')
      .in('pulsera_id', ids)
      .gt('created_at', vigilancia.marca)
      .order('created_at', { ascending: true })
      .limit(10)
      .then(function (res) {
        (res.data || []).forEach(procesarEscaneoNuevo);
      });
  }

  function procesarEscaneoNuevo(escaneo) {
    if (!escaneo || vigilancia.vistos[escaneo.id] || !vigilancia.pulseras[escaneo.pulsera_id]) return;
    vigilancia.vistos[escaneo.id] = true;
    if (!vigilancia.marca || escaneo.created_at > vigilancia.marca) vigilancia.marca = escaneo.created_at;
    mostrarAlertaEscaneo(escaneo);
  }

  function mostrarAlertaEscaneo(escaneo) {
    var info = vigilancia.pulseras[escaneo.pulsera_id];
    var hora = new Date(escaneo.created_at);
    var horaTexto = isNaN(hora.getTime()) ? '' : hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var tienePosicion = typeof escaneo.latitud === 'number' && typeof escaneo.longitud === 'number';

    el('alertaEscaneoTitulo').textContent = 'La pulsera de ' + info.nombre + ' fue escaneada';
    el('alertaEscaneoDetalle').textContent = 'Alguien acaba de leer la pulsera ' + (info.codigo || '') +
      (horaTexto ? ' a las ' + horaTexto : '') + '. Comunícate de inmediato.';
    pintarMapa('alertaEscaneoMapa', escaneo.latitud, escaneo.longitud);
    el('alertaEscaneoCoords').textContent = tienePosicion
      ? 'GPS: ' + escaneo.latitud.toFixed(6) + ', ' + escaneo.longitud.toFixed(6) +
        (escaneo.precision_metros ? ' · precisión ± ' + Math.round(escaneo.precision_metros) + ' m' : '')
      : 'El dispositivo que escaneó no compartió su ubicación GPS.';
    var enlace = el('alertaEscaneoMaps');
    enlace.hidden = !tienePosicion;
    if (tienePosicion) enlace.href = urlMapa(escaneo.latitud, escaneo.longitud);

    prepararAvisoRed('La pulsera de ' + info.nombre + ' fue escaneada' +
      (tienePosicion ? '. Ubicación: ' + urlMapa(escaneo.latitud, escaneo.longitud) : '.'));
    abrirModal('modalAlertaEscaneo');
    sonidoEscaneo();
    vibrar([300, 120, 300]);
    notificarNavegador('📍 Pulsera de ' + info.nombre + ' escaneada',
      tienePosicion ? 'Toca para ver la ubicación exacta en el mapa.' : 'Revisa tu panel Salva.', 'escaneo-' + escaneo.id);

    vigilancia.pendientes += 1;
    var contador = el('contadorAlertas');
    contador.textContent = vigilancia.pendientes;
    contador.hidden = false;
    if (!el('panelAlertas').hidden) cargarAlertas();
  }

  /* =========================================================
     SALVA CLOUD FAMILIAR — PAYWALL, RED MULTI-TUTOR
     Y BÓVEDA MÉDICA
     El control real de acceso vive en Supabase (RLS + función
     public.tiene_salva_cloud); esta capa solo adapta la interfaz.
     ========================================================= */
  var EMAIL_CREADOR = 'lee.fesna@gmail.com';
  var BUCKET_BOVEDA = 'boveda_medica';
  var MAX_TUTORES = 5;
  var MAX_DOC_MB = 10;
  var TIPOS_DOC = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  var ETIQUETAS_CATEGORIA = { examen: 'Examen clínico', receta: 'Receta médica', medicamentos: 'Calendario de medicamentos', otro: 'Otro' };

  function usuarioTieneSalvaCloud() {
    // 1. Acceso Vitalicio del Creador: Automático, permanente e inviolable
    if (estado.usuario && estado.usuario.email === 'lee.fesna@gmail.com') {
      return true;
    }
    // 2. Clientes normales: Valida si tienen membresía activa
    return Boolean(estado.usuario && estado.usuario.salva_cloud_activo);
  }

  function esCreador() {
    return Boolean(estado.usuario && estado.usuario.email === EMAIL_CREADOR);
  }

  var cloud = { membresia: null, tutores: [], documentos: [] };

  function enlaceActivarCloud(plan) {
    var texto = plan === 'anual' ? 'Anual ($79.000 COP / año)' : 'Mensual ($9.900 COP / mes)';
    var correo = estado.usuario ? estado.usuario.email : '';
    return 'https://wa.me/573505208592?text=' + encodeURIComponent(
      '☁️ *SALVA CLOUD FAMILIAR*\nHola, deseo activar la membresía ' + texto + ' para mi cuenta ' + correo + '.');
  }

  function cargarMembresia() {
    if (!supabase || !estado.usuario) return Promise.resolve();
    return supabase.from('membresias_cloud').select('activa, plan, vence_en')
      .eq('usuario_id', estado.usuario.id).maybeSingle()
      .then(function (res) {
        var m = res && !res.error ? res.data : null;
        cloud.membresia = m;
        estado.usuario.salva_cloud_activo = Boolean(m && m.activa && (!m.vence_en || new Date(m.vence_en) > new Date()));
      });
  }

  function iniciarSalvaCloud() {
    return cargarMembresia().then(function () {
      pintarEstadoCloud();
      if (usuarioTieneSalvaCloud()) {
        return cargarDatosCloud();
      }
    });
  }

  function pintarEstadoCloud() {
    var etiqueta = el('cloudEstado');
    var acceso = usuarioTieneSalvaCloud();
    if (esCreador()) {
      etiqueta.textContent = '👑 Creador · Acceso vitalicio';
      etiqueta.setAttribute('data-nivel', 'creador');
    } else if (acceso) {
      var vence = cloud.membresia && cloud.membresia.vence_en
        ? ' hasta ' + new Date(cloud.membresia.vence_en).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : '';
      etiqueta.textContent = '✅ Membresía activa' + vence;
      etiqueta.setAttribute('data-nivel', 'activa');
    } else {
      etiqueta.textContent = '🔒 Sin membresía';
      etiqueta.setAttribute('data-nivel', 'sin');
    }
    el('cloudPaywall').hidden = acceso;
    el('cloudContenido').hidden = !acceso;
    el('paywallAnual').href = enlaceActivarCloud('anual');
    el('paywallMensual').href = enlaceActivarCloud('mensual');
  }

  function consultaCloud(promesa, nombre) {
    return promesa.then(function (res) {
      if (res.error) {
        console.warn('Salva Cloud (' + nombre + '):', res.error.message);
        return [];
      }
      return res.data || [];
    });
  }

  function idsPortadores() {
    return estado.portadoresConPulsera.map(function (p) { return p.id; });
  }

  function cargarDatosCloud() {
    if (!usuarioTieneSalvaCloud()) return Promise.resolve();
    var portadores = idsPortadores();
    return Promise.all([
      consultaCloud(supabase.from('red_tutores').select('*').eq('usuario_id', estado.usuario.id).order('created_at', { ascending: true }), 'red_tutores'),
      portadores.length
        ? consultaCloud(supabase.from('boveda_medica').select('*').in('portador_id', portadores).order('created_at', { ascending: false }), 'boveda_medica')
        : Promise.resolve([])
    ]).then(function (r) {
      cloud.tutores = r[0];
      cloud.documentos = r[1];
      renderTutores();
      renderDocumentos();
      if (!el('gridPulseras').hidden) renderizarPulseras(); // refleja funciones Cloud desbloqueadas
    });
  }

  function mostrarPanelCloud() {
    pintarEstadoCloud();
    if (usuarioTieneSalvaCloud()) cargarDatosCloud();
  }

  document.querySelectorAll('.cloud-subtab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var seccion = tab.getAttribute('data-seccion');
      document.querySelectorAll('.cloud-subtab').forEach(function (t) {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      el('cloudTutores').hidden = seccion !== 'tutores';
      el('cloudBoveda').hidden = seccion !== 'boveda';
    });
  });

  // Ítem de lista seguro (todo el texto de usuario entra por textContent)
  function itemCloud(titulo, detalle, acciones, extraClase) {
    var item = document.createElement('article');
    item.className = 'cloud-item' + (extraClase ? ' ' + extraClase : '');
    var info = document.createElement('div');
    info.className = 'cloud-item-info';
    var fuerte = document.createElement('strong');
    fuerte.textContent = titulo;
    var span = document.createElement('span');
    span.textContent = detalle;
    info.appendChild(fuerte);
    info.appendChild(span);
    var zona = document.createElement('div');
    zona.className = 'cloud-item-acciones';
    acciones.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-outline btn-sm' + (a.peligro ? ' btn-peligro' : '');
      b.textContent = a.texto;
      b.addEventListener('click', a.fn);
      zona.appendChild(b);
    });
    item.appendChild(info);
    item.appendChild(zona);
    return item;
  }

  function listaVacia(contenedor, texto) {
    var p = document.createElement('p');
    p.className = 'cloud-vacio';
    p.textContent = texto;
    contenedor.appendChild(p);
  }

  /* ---------- Red Multi-Tutor (máx. 5) ---------- */
  poblarSelectPais('tutorPais');

  function renderTutores() {
    var lista = el('listaTutores');
    lista.innerHTML = '';
    el('contadorTutores').textContent = cloud.tutores.length + '/' + MAX_TUTORES;
    el('btnNuevoTutor').disabled = cloud.tutores.length >= MAX_TUTORES;
    el('btnNuevoTutor').title = cloud.tutores.length >= MAX_TUTORES ? 'Tu red ya tiene los 5 tutores permitidos' : '';
    if (!cloud.tutores.length) {
      listaVacia(lista, 'Aún no tienes tutores en tu red. Añade hasta 5 familiares para que reciban las alertas contigo.');
      return;
    }
    cloud.tutores.forEach(function (t) {
      lista.appendChild(itemCloud(
        t.nombre,
        (t.parentesco || 'Tutor') + ' · ' + t.telefono + (t.notificar_whatsapp === false ? ' · alertas pausadas' : ' · recibe alertas'),
        [
          { texto: 'Editar', fn: function () { abrirModalTutor(t); } },
          { texto: 'Eliminar', peligro: true, fn: function () { eliminarTutor(t); } }
        ]));
    });
  }

  function abrirModalTutor(tutor) {
    el('formTutor').reset();
    ['tutorNombre', 'tutorTelefono', 'tutorEmail'].forEach(function (id) { mostrarErrorCampo(id, ''); });
    el('tutorId').value = tutor ? tutor.id : '';
    el('tituloModalTutor').textContent = tutor ? 'Modificar tutor' : 'Añadir tutor a la red';
    if (tutor) {
      var tel = dividirTelefono(tutor.telefono);
      el('tutorNombre').value = tutor.nombre || '';
      el('tutorParentesco').value = tutor.parentesco || 'Otro';
      el('tutorPais').value = tel.codigo;
      el('tutorTelefono').value = tel.numero;
      el('tutorEmail').value = tutor.email || '';
      el('tutorNotificar').checked = tutor.notificar_whatsapp !== false;
    } else {
      el('tutorPais').value = '+57';
    }
    abrirModal('modalTutor');
  }

  el('btnNuevoTutor').addEventListener('click', function () {
    if (cloud.tutores.length >= MAX_TUTORES) {
      mostrarToast('Tu red ya tiene 5 tutores. Elimina uno para añadir otro.', 'info');
      return;
    }
    abrirModalTutor(null);
  });

  el('formTutor').addEventListener('submit', function (e) {
    e.preventDefault();
    var valido = validarCampoRequerido('tutorNombre', 'El nombre es obligatorio.');
    valido = validarTelefono('tutorTelefono', true) && valido;
    var correo = el('tutorEmail').value.trim();
    if (correo && !esEmailValido(correo)) { mostrarErrorCampo('tutorEmail', 'Correo no válido.'); valido = false; }
    else mostrarErrorCampo('tutorEmail', '');
    if (!valido) return;

    var id = el('tutorId').value;
    var payload = {
      nombre: el('tutorNombre').value.trim(),
      parentesco: el('tutorParentesco').value,
      telefono: combinarTelefono(el('tutorPais').value, el('tutorTelefono').value),
      email: correo || null,
      notificar_whatsapp: el('tutorNotificar').checked
    };
    var boton = el('btnGuardarTutor');
    boton.disabled = true;
    var consulta = id
      ? supabase.from('red_tutores').update(payload).eq('id', id)
      : supabase.from('red_tutores').insert(Object.assign({ usuario_id: estado.usuario.id }, payload));
    consulta.then(function (res) {
      boton.disabled = false;
      if (res.error) { mostrarToast('No se pudo guardar el tutor: ' + res.error.message, 'error'); return; }
      mostrarToast(id ? 'Tutor actualizado.' : 'Tutor añadido a tu red.', 'exito');
      cerrarModal('modalTutor');
      cargarDatosCloud();
    });
  });

  function eliminarTutor(tutor) {
    if (!window.confirm('¿Eliminar a ' + tutor.nombre + ' de tu red de tutores? Dejará de recibir alertas.')) return;
    supabase.from('red_tutores').delete().eq('id', tutor.id).then(function (res) {
      if (res.error) { mostrarToast('No se pudo eliminar: ' + res.error.message, 'error'); return; }
      mostrarToast('Tutor eliminado de la red.', 'info');
      cargarDatosCloud();
    });
  }

  // Desde cualquier alarma crítica: avisar a la red por WhatsApp con un toque
  function prepararAvisoRed(mensaje) {
    var cont = el('alertaRedTutores');
    cont.innerHTML = '';
    var activos = cloud.tutores.filter(function (t) { return t.notificar_whatsapp !== false; });
    if (!usuarioTieneSalvaCloud() || !activos.length) { cont.hidden = true; return; }
    var titulo = document.createElement('p');
    titulo.textContent = 'Avisar a tu red de tutores:';
    cont.appendChild(titulo);
    activos.forEach(function (t) {
      var a = document.createElement('a');
      a.className = 'btn btn-outline btn-sm';
      a.target = '_blank';
      a.rel = 'noopener';
      a.href = 'https://wa.me/' + String(t.telefono).replace(/\D/g, '') + '?text=' + encodeURIComponent('🚨 Alerta Salva: ' + mensaje);
      a.textContent = '💬 ' + t.nombre;
      cont.appendChild(a);
    });
    cont.hidden = false;
  }

  /* ---------- Bóveda Médica Cloud ---------- */
  function nombrePortador(portadorId) {
    var p = estado.portadoresConPulsera.filter(function (x) { return x.id === portadorId; })[0];
    return p ? textoOAlternativa(p.nombre_completo, 'Portador') : 'Portador';
  }

  function renderDocumentos() {
    var lista = el('listaDocumentos');
    lista.innerHTML = '';
    el('btnNuevoDocumento').disabled = !estado.portadoresConPulsera.length;
    if (!cloud.documentos.length) {
      listaVacia(lista, estado.portadoresConPulsera.length
        ? 'Tu bóveda está vacía. Sube exámenes, recetas o el calendario de medicamentos.'
        : 'Vincula una pulsera para empezar a guardar documentos médicos.');
      return;
    }
    cloud.documentos.forEach(function (d) {
      var esPdf = /\.pdf$/i.test(d.archivo_url || '');
      lista.appendChild(itemCloud(
        (esPdf ? '📄 ' : '🖼️ ') + d.nombre,
        (ETIQUETAS_CATEGORIA[d.categoria] || 'Documento') + ' · ' + nombrePortador(d.portador_id) + ' · ' +
          new Date(d.created_at).toLocaleDateString('es-CO', { dateStyle: 'medium' }),
        [
          { texto: 'Ver', fn: function () { verDocumento(d); } },
          { texto: 'Renombrar', fn: function () { abrirModalDocumento(d); } },
          { texto: 'Eliminar', peligro: true, fn: function () { eliminarDocumento(d); } }
        ]));
    });
  }

  function abrirModalDocumento(doc) {
    el('formDocumento').reset();
    ['documentoArchivo', 'documentoPortador', 'documentoNombre'].forEach(function (id) { mostrarErrorCampo(id, ''); });
    var select = el('documentoPortador');
    select.innerHTML = '';
    estado.portadoresConPulsera.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = textoOAlternativa(p.nombre_completo, 'Portador');
      select.appendChild(opt);
    });
    el('documentoId').value = doc ? doc.id : '';
    el('campoArchivo').hidden = !!doc;
    el('campoPortadorDoc').hidden = !!doc;
    el('tituloModalDocumento').textContent = doc ? 'Renombrar documento' : 'Subir documento médico';
    el('btnGuardarDocumento').textContent = doc ? 'Guardar cambios' : 'Subir a la bóveda';
    if (doc) {
      el('documentoNombre').value = doc.nombre || '';
      el('documentoCategoria').value = ETIQUETAS_CATEGORIA[doc.categoria] ? doc.categoria : 'otro';
    }
    abrirModal('modalDocumento');
  }

  el('btnNuevoDocumento').addEventListener('click', function () { abrirModalDocumento(null); });

  el('documentoArchivo').addEventListener('change', function () {
    var archivo = el('documentoArchivo').files[0];
    if (archivo && !el('documentoNombre').value) el('documentoNombre').value = archivo.name.replace(/\.[^.]+$/, '').slice(0, 120);
  });

  function rutaSegura(nombre) {
    return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
  }

  el('formDocumento').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = el('documentoId').value;
    var nombre = el('documentoNombre').value.trim();
    var categoria = el('documentoCategoria').value;
    if (!nombre) { mostrarErrorCampo('documentoNombre', 'Dale un nombre al documento.'); return; }
    mostrarErrorCampo('documentoNombre', '');
    var boton = el('btnGuardarDocumento');

    if (id) {
      boton.disabled = true;
      supabase.from('boveda_medica').update({ nombre: nombre, categoria: categoria }).eq('id', id).then(function (res) {
        boton.disabled = false;
        if (res.error) { mostrarToast('No se pudo renombrar: ' + res.error.message, 'error'); return; }
        mostrarToast('Documento actualizado.', 'exito');
        cerrarModal('modalDocumento');
        cargarDatosCloud();
      });
      return;
    }

    var archivo = el('documentoArchivo').files[0];
    var portadorId = el('documentoPortador').value;
    if (!archivo) { mostrarErrorCampo('documentoArchivo', 'Selecciona un PDF o una imagen.'); return; }
    if (TIPOS_DOC.indexOf(archivo.type) === -1) { mostrarErrorCampo('documentoArchivo', 'Formato no admitido: usa PDF, JPG, PNG, WEBP o HEIC.'); return; }
    if (archivo.size > MAX_DOC_MB * 1024 * 1024) { mostrarErrorCampo('documentoArchivo', 'El archivo supera los ' + MAX_DOC_MB + ' MB.'); return; }
    if (!portadorId) { mostrarErrorCampo('documentoPortador', 'Selecciona el portador.'); return; }
    mostrarErrorCampo('documentoArchivo', '');

    boton.disabled = true;
    var cerrarCarga = mostrarToast('Subiendo documento cifrado…', 'carga');
    var ruta = estado.usuario.id + '/' + portadorId + '/' + Date.now() + '-' + rutaSegura(archivo.name);

    supabase.storage.from(BUCKET_BOVEDA).upload(ruta, archivo, { contentType: archivo.type, upsert: false })
      .then(function (subida) {
        if (subida.error) throw subida.error;
        return supabase.from('boveda_medica').insert({ portador_id: portadorId, nombre: nombre, categoria: categoria, archivo_url: ruta });
      })
      .then(function (res) {
        if (res.error) {
          supabase.storage.from(BUCKET_BOVEDA).remove([ruta]); // evita archivos huérfanos
          throw res.error;
        }
        cerrarCarga();
        boton.disabled = false;
        mostrarToast('Documento guardado en tu bóveda médica.', 'exito');
        cerrarModal('modalDocumento');
        cargarDatosCloud();
      })
      .catch(function (error) {
        cerrarCarga();
        boton.disabled = false;
        mostrarToast('No se pudo subir el documento: ' + (error && error.message ? error.message : 'error desconocido'), 'error');
      });
  });

  function verDocumento(doc) {
    if (/^https?:\/\//i.test(doc.archivo_url || '')) { window.open(doc.archivo_url, '_blank', 'noopener'); return; }
    var ventana = window.open('', '_blank'); // se abre en el clic para evitar el bloqueo de ventanas emergentes
    supabase.storage.from(BUCKET_BOVEDA).createSignedUrl(doc.archivo_url, 300).then(function (res) {
      if (res.error || !res.data) {
        if (ventana) ventana.close();
        mostrarToast('No se pudo abrir el documento: ' + (res.error ? res.error.message : ''), 'error');
        return;
      }
      if (ventana) ventana.location.href = res.data.signedUrl;
      else window.location.href = res.data.signedUrl;
    });
  }

  function eliminarDocumento(doc) {
    if (!window.confirm('¿Eliminar "' + doc.nombre + '" de la bóveda? Esta acción no se puede deshacer.')) return;
    var borrarArchivo = /^https?:\/\//i.test(doc.archivo_url || '')
      ? Promise.resolve({})
      : supabase.storage.from(BUCKET_BOVEDA).remove([doc.archivo_url]);
    borrarArchivo.then(function () {
      return supabase.from('boveda_medica').delete().eq('id', doc.id);
    }).then(function (res) {
      if (res.error) { mostrarToast('No se pudo eliminar: ' + res.error.message, 'error'); return; }
      mostrarToast('Documento eliminado.', 'info');
      cargarDatosCloud();
    });
  }

  function haceCuanto(fechaIso) {
    var seg = Math.max(0, Math.round((Date.now() - new Date(fechaIso).getTime()) / 1000));
    if (seg < 60) return 'hace ' + seg + ' s';
    if (seg < 3600) return 'hace ' + Math.round(seg / 60) + ' min';
    if (seg < 86400) return 'hace ' + Math.round(seg / 3600) + ' h';
    return new Date(fechaIso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function reiniciarSalvaCloud() {
    cloud = { membresia: null, tutores: [], documentos: [] };
  }

  /* =========================================================
     Instalar la App Salva (PWA)
     ========================================================= */
  var CLAVE_BANNER_APP = 'salva_banner_app_cerrado';

  function bannerAppDescartado() {
    try { return localStorage.getItem(CLAVE_BANNER_APP) === '1'; } catch (e) { return false; }
  }

  if (window.SalvaPWA) {
    window.SalvaPWA.alCambiar(function (e) {
      // Se muestra si el navegador permite instalar (Android/Chrome/Edge) o si es iPhone (guía visual)
      el('bannerInstalarApp').hidden = e.instalada || bannerAppDescartado() || !(e.nativa || e.ios);
      el('instalarAppDetalle').textContent = e.ios
        ? 'En iPhone: Compartir → “Agregar a pantalla de inicio”. Te mostramos cómo.'
        : 'Entra a tu panel con un toque desde la pantalla de inicio de tu celular.';
    });
    el('btnInstalarApp').addEventListener('click', function () {
      window.SalvaPWA.instalar().then(function (resultado) {
        if (resultado === 'accepted') mostrarToast('¡App Salva instalada! Ábrela desde tu pantalla de inicio.', 'exito');
      });
    });
    el('btnCerrarInstalarApp').addEventListener('click', function () {
      try { localStorage.setItem(CLAVE_BANNER_APP, '1'); } catch (e) { /* sin almacenamiento */ }
      el('bannerInstalarApp').hidden = true;
    });
  }

  /* =========================================================
     Arranque
     ========================================================= */
  mostrarVistaCargando();
})();
