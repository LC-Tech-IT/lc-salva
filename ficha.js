/* =========================================================
   Salva — Desarrollado y respaldado por LC Tech
   ficha.js — Ficha pública de emergencia (Salva Band / Salva Watch)
   Privacidad (Ley 1581): la ficha se lee SOLO con la función
   obtener_ficha_publica(codigo_qr), nunca leyendo tablas completas.
   Cada escaneo se registra con registrar_escaneo(); un webhook del
   servidor avisa a la familia por WhatsApp con la ubicación.
   ========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://bfxolduuqkrhyfjrvwsx.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_xcSIX2__GnOZ6vL7__BuOQ_pEQ5L-FJ';

  var supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  /* Contexto: abierta desde Mi Panel o desde la App Salva instalada (no por un socorrista).
     En ese caso la navegación se queda dentro de la app: nunca salta a la landing. */
  var params = new URLSearchParams(window.location.search);
  var enApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var desdePanel = params.get('desde') === 'panel' ||
    (document.referrer.indexOf(window.location.origin) === 0 && /\/admin(\.html)?(\?|#|$)/.test(document.referrer.slice(window.location.origin.length)));

  if (enApp || desdePanel) {
    var volver = document.getElementById('btnVolverPanel');
    var logo = document.getElementById('fichaBrandLink');
    if (volver) volver.hidden = false;
    if (logo) logo.href = 'admin.html';
    document.body.classList.add('ficha-en-app');
  }

  function nombreProducto(codigoQr) {
    return /^SALVA-W-/i.test(codigoQr || '') ? 'Salva Watch' : 'Salva Band';
  }

  // La función RPC aún no existe si no se ha ejecutado la migración de privacidad
  function rpcNoDisponible(error) {
    return !!error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''));
  }

  var views = {
    skeleton: document.getElementById('view-skeleton'),
    error: document.getElementById('view-error'),
    unlinked: document.getElementById('view-unlinked'),
    ficha: document.getElementById('view-ficha')
  };

  function mostrarVista(nombre) {
    Object.keys(views).forEach(function (key) {
      if (views[key]) views[key].hidden = key !== nombre;
    });
  }

  function obtenerIdentificadorDeUrl() {
    var params = new URLSearchParams(window.location.search);
    var qr = params.get('qr');
    var id = params.get('id');
    return { qr: qr, id: id };
  }

  function mostrarError(titulo, mensaje) {
    var titleEl = document.getElementById('errorTitle');
    var msgEl = document.getElementById('errorMessage');
    if (titleEl) titleEl.textContent = titulo;
    if (msgEl) msgEl.textContent = mensaje;
    mostrarVista('error');
  }

  function textoOAlternativa(valor, alternativa) {
    if (!valor) return alternativa;
    if (Array.isArray(valor)) return valor.length ? valor.join(', ') : alternativa;
    var texto = String(valor).trim();
    return texto ? texto : alternativa;
  }

  function soloDigitos(telefono) {
    return String(telefono || '').replace(/\D/g, '');
  }

  function construirHrefTel(telefono) {
    var digitos = soloDigitos(telefono);
    return digitos ? 'tel:+' + digitos : null;
  }

  function construirHrefWhatsapp(telefono, nombrePortador, ubicacion) {
    var digitos = soloDigitos(telefono);
    if (!digitos) return null;
    var texto = '🚨 ALERTA DE AUXILIO: Acabo de escanear la pulsera médica Salva de ' + nombrePortador + '.';
    if (ubicacion) {
      texto += '\n📍 Ubicación GPS de auxilio: https://www.google.com/maps?q=' + ubicacion.lat + ',' + ubicacion.lng;
    }
    return 'https://wa.me/' + digitos + '?text=' + encodeURIComponent(texto);
  }

  /* Pestañas de la Ficha (Resumen vs Historia Clínica) */
  document.querySelectorAll('.ficha-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.ficha-tab').forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      var target = tab.getAttribute('data-tab');
      var tabResumen = document.getElementById('tabResumen');
      var tabHistoria = document.getElementById('tabHistoria');
      if (tabResumen && tabHistoria) {
        tabResumen.hidden = target !== 'resumen';
        tabHistoria.hidden = target !== 'historia';
      }
    });
  });

  function renderFicha(pulsera, portador) {
    var nombre = textoOAlternativa(portador.nombre_completo, 'Portador Seguro');

    document.getElementById('nombrePortador').textContent = nombre;
    document.getElementById('grupoSanguineo').textContent = textoOAlternativa(portador.tipo_sangre, 'No registrado');
    document.getElementById('alergias').textContent = textoOAlternativa(portador.alergias, 'Sin alergias registradas.');
    document.getElementById('enfermedadesCondiciones').textContent = textoOAlternativa(portador.enfermedades_condiciones, 'Sin condiciones preexistentes registradas.');
    document.getElementById('epsSeguro').textContent = textoOAlternativa(portador.eps_seguro, 'Sin EPS registrada.');
    document.getElementById('medicamentos').textContent = textoOAlternativa(portador.medicamentos, 'Sin medicamentos registrados.');

    /* Campos de Historia Clínica */
    var cronicasEl = document.getElementById('historiaCronicas');
    if (cronicasEl) {
      cronicasEl.textContent = textoOAlternativa(portador.enfermedades_condiciones, 'Ninguna enfermedad crónica reportada.');
    }

    var cirugiasEl = document.getElementById('historiaCirugias');
    if (cirugiasEl) {
      cirugiasEl.textContent = textoOAlternativa(portador.antecedentes_quirurgicos || portador.cirugias, 'Sin cirugías ni prótesis registradas.');
    }

    var medicoEl = document.getElementById('historiaMedico');
    if (medicoEl) {
      medicoEl.textContent = textoOAlternativa(portador.medico_tratante, portador.eps_seguro ? 'Atención en ' + portador.eps_seguro : 'Atención general EPS.');
    }

    var instruccionesEl = document.getElementById('historiaInstrucciones');
    if (instruccionesEl) {
      instruccionesEl.textContent = textoOAlternativa(
        portador.notas_adicionales, 
        'En caso de emergencia, mantener la calma del portador, verificar signos vitales y contactar de inmediato a la red de apoyo registrada.'
      );
    }

    var foto = document.getElementById('fotoPortador');
    var fallback = document.getElementById('avatarFallback');
    if (portador.foto_url) {
      foto.src = portador.foto_url;
      foto.alt = 'Foto de ' + nombre;
      foto.hidden = false;
      fallback.hidden = true;
      foto.addEventListener('error', function () {
        foto.hidden = true;
        fallback.hidden = false;
      });
    } else {
      foto.hidden = true;
      fallback.hidden = false;
    }

    var btnLlamar = document.getElementById('btnLlamarAcudiente');
    var hrefLlamar = construirHrefTel(portador.contacto_emergencia_1_telefono);
    if (hrefLlamar) {
      btnLlamar.href = hrefLlamar;
      document.getElementById('labelLlamarAcudiente').textContent = portador.contacto_emergencia_1_nombre
        ? 'Llamar a ' + portador.contacto_emergencia_1_nombre
        : 'Llamar a Acudiente Principal';
      btnLlamar.hidden = false;
    }

    var btnWhatsapp = document.getElementById('btnWhatsapp');
    var hrefWhatsapp = construirHrefWhatsapp(portador.contacto_emergencia_1_telefono, nombre, null);
    if (hrefWhatsapp) {
      btnWhatsapp.href = hrefWhatsapp;
      btnWhatsapp.hidden = false;
      btnWhatsapp.dataset.telefono = portador.contacto_emergencia_1_telefono;
      btnWhatsapp.dataset.nombre = nombre;
    }

    var btnSecundario = document.getElementById('btnContactoSecundario');
    var hrefSecundario = construirHrefTel(portador.contacto_emergencia_2_telefono);
    if (hrefSecundario) {
      btnSecundario.href = hrefSecundario;
      var etiqueta = portador.contacto_emergencia_2_nombre
        ? 'Llamar a ' + portador.contacto_emergencia_2_nombre
        : 'Contacto Secundario';
      document.getElementById('labelContactoSecundario').textContent = etiqueta;
      btnSecundario.hidden = false;
    }

    var planBadgeHeader = document.getElementById('planBadgeHeader');
    if (planBadgeHeader && pulsera.codigo_qr) {
      planBadgeHeader.textContent = nombreProducto(pulsera.codigo_qr);
      planBadgeHeader.className = 'plan-badge-header';
      planBadgeHeader.hidden = false;
    }

    var sosBanner = document.getElementById('sosBanner');
    if (sosBanner) sosBanner.hidden = true; // hardware 100% pasivo: sin GPS ni botón SOS propio

    mostrarVista('ficha');
    registrarEscaneo(pulsera);
  }

  /* Registro del escaneo + ubicación del socorrista (si la autoriza).
     Se registra aunque no comparta ubicación: la familia igual recibe el aviso. */
  var escaneoRegistrado = false;

  function registrarEscaneo(pulsera) {
    if (escaneoRegistrado || !supabase || !pulsera.codigo_qr || pulsera.id === 'demo-1') return;
    escaneoRegistrado = true;

    var enviado = false;
    function enviar(lat, lng, precision) {
      if (enviado) return;
      enviado = true;
      supabase.rpc('registrar_escaneo', {
        p_codigo_qr: pulsera.codigo_qr,
        p_latitud: lat,
        p_longitud: lng,
        p_precision: precision
      }).then(function (res) {
        if (!res.error) return;
        if (rpcNoDisponible(res.error) && lat !== null) {
          // Compatibilidad mientras se ejecuta la migración de privacidad
          supabase.from('escaneos_ubicacion')
            .insert({ pulsera_id: pulsera.id, latitud: lat, longitud: lng, precision_metros: precision })
            .then(function (r) { if (r.error) console.warn('Escaneo:', r.error.message); });
        } else {
          console.warn('Escaneo:', res.error.message);
        }
      });
    }

    if (!('geolocation' in navigator)) { enviar(null, null, null); return; }

    // El timeout de getCurrentPosition no corre mientras el permiso está sin responder:
    // si quien escanea ignora la pregunta de ubicación, la alerta sale igual sin GPS
    var respaldo = setTimeout(function () { enviar(null, null, null); }, 10000);

    navigator.geolocation.getCurrentPosition(
      function (posicion) {
        clearTimeout(respaldo);
        var lat = posicion.coords.latitude;
        var lng = posicion.coords.longitude;
        enviar(lat, lng, posicion.coords.accuracy);
        actualizarWhatsappConUbicacion(lat, lng); // aun si llega tarde, el botón de WhatsApp lleva el GPS
      },
      function (error) {
        clearTimeout(respaldo);
        console.warn('Geolocalización omitida:', error.message);
        enviar(null, null, null);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  function actualizarWhatsappConUbicacion(lat, lng) {
    var btnWhatsapp = document.getElementById('btnWhatsapp');
    if (btnWhatsapp && !btnWhatsapp.hidden) {
      var hrefConUbicacion = construirHrefWhatsapp(btnWhatsapp.dataset.telefono, btnWhatsapp.dataset.nombre, { lat: lat, lng: lng });
      if (hrefConUbicacion) btnWhatsapp.href = hrefConUbicacion;
    }
  }

  function cargarFicha() {
    mostrarVista('skeleton');

    var identificador = obtenerIdentificadorDeUrl();
    var valorBusqueda = identificador.qr || identificador.id;

    if (!valorBusqueda) {
      // Demo por defecto si no se pasa parámetro en la URL
      renderFicha(
        { id: 'demo-1', codigo_qr: 'SALVA-B-DEMO', estado: 'activa' },
        {
          nombre_completo: 'Sofía Ramírez Vargas',
          tipo_sangre: 'O+',
          alergias: 'Penicilina y Frutos Secos (Riesgo Anafilaxia).',
          enfermedades_condiciones: 'Asma bronquial leve controlada.',
          medicamentos: 'Inhalador Salbutamol (2 disparos ante crisis asmática).',
          eps_seguro: 'Sura EPS (Plan Complementario)',
          antecedentes_quirurgicos: 'Apendicectomía (2024).',
          medico_tratante: 'Dra. Patricia Ortiz (Pediatra)',
          contacto_emergencia_1_nombre: 'Mamá (Andrea V.)',
          contacto_emergencia_1_telefono: '3001234567',
          contacto_emergencia_2_nombre: 'Papá (Carlos R.)',
          contacto_emergencia_2_telefono: '3505208592',
          notas_adicionales: 'En caso de crisis asmática, aplicar inhalador y comunicar de inmediato a mamá.'
        }
      );
      return;
    }

    if (!supabase) {
      mostrarError('Servidor no disponible', 'Intenta recargar la página en unos momentos.');
      return;
    }

    var codigo = identificador.qr ? identificador.qr.trim().toUpperCase() : null;

    supabase
      .rpc('obtener_ficha_publica', { p_codigo_qr: codigo, p_id: codigo ? null : identificador.id })
      .then(function (resultado) {
        if (rpcNoDisponible(resultado.error)) return consultaDirectaLegada(identificador);
        if (resultado.error) return { error: resultado.error };
        var d = resultado.data;
        if (!d) return { data: null };
        var p = d.portador;
        return {
          data: {
            id: d.id, codigo_qr: d.codigo_qr, tipo_plan: d.tipo_plan, estado: d.estado,
            portadores: p ? {
              nombre_completo: p.nombre_completo,
              tipo_sangre: p.tipo_sangre,
              alergias: p.alergias,
              enfermedades_condiciones: p.enfermedades_condiciones,
              medicamentos: p.medicamentos,
              eps_seguro: p.eps_seguro,
              foto_url: p.foto_url,
              contacto_emergencia_1_nombre: p.contacto_1_nombre,
              contacto_emergencia_1_telefono: p.contacto_1_telefono,
              contacto_emergencia_2_nombre: p.contacto_2_nombre,
              contacto_emergencia_2_telefono: p.contacto_2_telefono,
              notas_adicionales: p.notas_adicionales
            } : null
          }
        };
      })
      .then(function (resultado) {
        if (resultado.error) {
          mostrarError('Error de consulta', 'Ocurrió un problema al cargar los datos.');
          return;
        }

        var pulsera = resultado.data;
        if (!pulsera) {
          mostrarError('Pulsera no registrada', 'El código escaneado no existe en nuestro sistema.');
          return;
        }

        var portador = Array.isArray(pulsera.portadores) ? pulsera.portadores[0] : pulsera.portadores;
        var estaVinculada = pulsera.estado && pulsera.estado !== 'disponible' && portador;

        if (!estaVinculada) {
          var btnVincular = document.querySelector('#view-unlinked a.btn');
          if (btnVincular && pulsera.codigo_qr) {
            btnVincular.href = 'admin.html?qr=' + encodeURIComponent(pulsera.codigo_qr);
          }
          mostrarVista('unlinked');
          return;
        }

        renderFicha(pulsera, portador);
      })
      .catch(function () {
        mostrarError('Sin conexión', 'Revisa tu conexión a internet e intenta de nuevo.');
      });
  }

  // Solo se usa si la migración de privacidad aún no está aplicada en Supabase
  function consultaDirectaLegada(identificador) {
    var columna = identificador.qr ? 'codigo_qr' : 'id';
    return supabase
      .from('pulseras')
      .select('id, estado, tipo_plan, codigo_qr, portadores(*)')
      .eq(columna, identificador.qr || identificador.id)
      .maybeSingle();
  }

  var retryBtn = document.getElementById('retryBtn');
  if (retryBtn) retryBtn.addEventListener('click', cargarFicha);

  cargarFicha();
})();
