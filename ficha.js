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

  function actualizarEstadoGps(tipo, texto, mostrarBoton) {
    var box = document.getElementById('gpsBox');
    var textoEl = document.getElementById('gpsEstadoTexto');
    var btn = document.getElementById('btnCompartirUbicacion');
    if (!box || !textoEl || !btn) return;
    box.className = 'gps-box' + (tipo ? ' gps-box--' + tipo : '');
    textoEl.textContent = texto;
    btn.hidden = !mostrarBoton;
    box.hidden = false;
  }

  function textoPrecisionGps(precision) {
    return typeof precision === 'number' && isFinite(precision) && precision > 0
      ? ' (±' + Math.round(precision) + ' m)'
      : '';
  }

  function solicitarPosicionConRespaldo(alExito, alFallo) {
    if (!('geolocation' in navigator)) {
      alFallo({ code: 0, message: 'Geolocalización no disponible' });
      return;
    }

    function pedir(altaPrecision, timeoutMs, maxAgeMs, onError) {
      navigator.geolocation.getCurrentPosition(alExito, onError, {
        enableHighAccuracy: altaPrecision,
        timeout: timeoutMs,
        maximumAge: maxAgeMs
      });
    }

    // Etapa 1: GPS de alta precisión o caché reciente (5 min)
    pedir(true, 7000, 300000, function (err) {
      if (err && err.code === 1) {
        alFallo(err); // permiso denegado: no insistir en segundo plano
        return;
      }
      // Etapa 2: respaldo rápido por red/Wi-Fi si el satélite tarda bajo techo
      pedir(false, 5000, 600000, alFallo);
    });
  }

  function registrarEscaneo(pulsera) {
    if (escaneoRegistrado || !supabase || !pulsera.codigo_qr || pulsera.id === 'demo-1') return;
    escaneoRegistrado = true;

    var enviado = false;
    var enviadoConGps = false;
    var respaldo = null;
    var intentoManualEnCurso = false;

    function enviarAlServidor(lat, lng, precision, esReintentoConGps) {
      if (!esReintentoConGps && enviado) return;
      if (!esReintentoConGps) enviado = true;

      var precTxt = textoPrecisionGps(precision);
      supabase.rpc('registrar_escaneo', {
        p_codigo_qr: pulsera.codigo_qr,
        p_latitud: lat,
        p_longitud: lng,
        p_precision: precision
      }).then(function (res) {
        if (res.error) {
          if (rpcNoDisponible(res.error) && lat !== null) {
            // Compatibilidad mientras se ejecuta la migración de privacidad
            supabase.from('escaneos_ubicacion')
              .insert({ pulsera_id: pulsera.id, latitud: lat, longitud: lng, precision_metros: precision })
              .then(function (r) {
                if (r.error) console.warn('Escaneo:', r.error.message);
                else {
                  enviadoConGps = true;
                  actualizarEstadoGps('ok', 'Ubicación GPS enviada a la familia' + precTxt + '.', false);
                }
              });
          } else {
            console.warn('Escaneo:', res.error.message);
          }
          return;
        }

        if (lat !== null) {
          if (res.data === true) {
            enviadoConGps = true;
            actualizarEstadoGps('ok', 'Ubicación GPS enviada a la familia' + precTxt + '.', false);
          } else {
            // Dentro de la ventana de 60 s anti-duplicados: queda lista en el botón directo de WhatsApp
            actualizarEstadoGps('ok', 'Ubicación GPS lista' + precTxt + ' en el botón de WhatsApp arriba.', false);
          }
        }
      });
    }

    function aplicarCoordenadas(posicion) {
      clearTimeout(respaldo);
      var lat = posicion.coords.latitude;
      var lng = posicion.coords.longitude;
      var precision = posicion.coords.accuracy;
      actualizarWhatsappConUbicacion(lat, lng);

      if (!enviado) {
        enviarAlServidor(lat, lng, precision, false);
      } else if (!enviadoConGps) {
        enviarAlServidor(lat, lng, precision, true);
      }
    }

    var btnCompartir = document.getElementById('btnCompartirUbicacion');
    var labelCompartir = document.getElementById('labelCompartirUbicacion');
    if (btnCompartir) {
      btnCompartir.addEventListener('click', function () {
        if (intentoManualEnCurso || btnCompartir.getAttribute('aria-disabled') === 'true') return;
        intentoManualEnCurso = true;
        btnCompartir.setAttribute('aria-disabled', 'true');
        if (labelCompartir) labelCompartir.textContent = 'Buscando señal GPS…';

        solicitarPosicionConRespaldo(
          function (posicion) {
            intentoManualEnCurso = false;
            btnCompartir.removeAttribute('aria-disabled');
            if (labelCompartir) labelCompartir.textContent = 'Compartir ubicación GPS ahora';
            aplicarCoordenadas(posicion);
          },
          function (error) {
            intentoManualEnCurso = false;
            btnCompartir.removeAttribute('aria-disabled');
            if (labelCompartir) labelCompartir.textContent = 'Reintentar ubicación GPS';
            console.warn('Reintento GPS fallido:', error && error.message);
            if (error && error.code === 1) {
              actualizarEstadoGps('aviso', 'El navegador sigue bloqueando la ubicación. Habilítala en el ícono de la barra y vuelve a tocar.', true);
            } else {
              actualizarEstadoGps('aviso', 'Aún sin señal GPS. Acércate a un espacio abierto y vuelve a intentarlo.', true);
            }
          }
        );
      });
    }

    function iniciarCaptura(estadoPermiso) {
      if (!('geolocation' in navigator)) {
        enviarAlServidor(null, null, null, false);
        return;
      }

      if (estadoPermiso === 'denied') {
        enviarAlServidor(null, null, null, false);
        actualizarEstadoGps('aviso', 'Ubicación bloqueada en el navegador. Actívala y toca abajo si deseas adjuntar el mapa GPS.', true);
        return;
      }

      actualizarEstadoGps('pendiente', 'Permite compartir tu ubicación para enviar el mapa exacto del rescate a la familia.', false);

      // Si quien escanea ignora la solicitud de ubicación o el GPS se demora,
      // el aviso automático igual sale a los 13.5 s sin bloquear a la familia.
      respaldo = setTimeout(function () {
        if (!enviado) {
          enviarAlServidor(null, null, null, false);
          actualizarEstadoGps('aviso', 'El aviso salió sin mapa GPS porque el teléfono no respondió a tiempo. Puedes reintentar abajo.', true);
        }
      }, 13500);

      solicitarPosicionConRespaldo(
        aplicarCoordenadas,
        function (error) {
          clearTimeout(respaldo);
          console.warn('Geolocalización omitida:', error && error.message);
          if (!enviado) enviarAlServidor(null, null, null, false);
          if (error && error.code === 1) {
            actualizarEstadoGps('aviso', 'Permiso de ubicación denegado. Actívalo en el navegador y toca abajo para adjuntar el mapa.', true);
          } else {
            actualizarEstadoGps('aviso', 'No se pudo obtener GPS automáticamente. Puedes reintentar abajo para adjuntar el mapa.', true);
          }
        }
      );
    }

    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      try {
        navigator.permissions.query({ name: 'geolocation' }).then(
          function (permiso) { iniciarCaptura(permiso.state); },
          function () { iniciarCaptura('prompt'); }
        );
        return;
      } catch (e) { /* Safari antiguo o contexto sin Permissions API para geolocalización */ }
    }
    iniciarCaptura('prompt');
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

    var params = new URLSearchParams(window.location.search);
    var esDemo = !valorBusqueda ||
                 params.get('demo') === '1' ||
                 params.get('demo') === 'true' ||
                 (valorBusqueda && (
                   valorBusqueda.toUpperCase() === 'SALVA-B-DEMO' ||
                   valorBusqueda.toUpperCase() === 'SALVA-W-DEMO' ||
                   valorBusqueda.toUpperCase() === 'DEMO' ||
                   valorBusqueda === 'demo-1'
                 ));

    if (esDemo) {
      // Demo por defecto si no se pasa parámetro en la URL o si se solicita explícitamente demo
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
          contacto_emergencia_2_telefono: '3204502958',
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
          var btnActivar = document.getElementById('btnUnlinkedActivar');
          var badge = document.getElementById('unlinkedBadge');
          if (badge && pulsera.codigo_qr) {
            badge.textContent = nombreProducto(pulsera.codigo_qr);
          }
          if (btnActivar && pulsera.codigo_qr) {
            btnActivar.href = 'admin.html?qr=' + encodeURIComponent(pulsera.codigo_qr);
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
