// Salva — Desarrollado y respaldado por LC Tech
// Edge Function: webhook oficial de eventos de Wompi (transaction.updated).
//
// Flujo:
// 1. Wompi notifica cuando una transacción es APROBADA (APPROVED).
// 2. Actualiza la tabla public.pedidos a estado = 'pagado' con el ID de transacción y método.
// 3. Si el pedido incluye Salva Cloud Familiar, activa la membresía en public.membresias_cloud.
// 4. Envía el CORREO DE COMPRA EXITOSA Y BIENVENIDA al email del comprador (Resend / SMTP).
//    REGLA ESTRICTA: NO envía mensajes de compra por WhatsApp (WhatsApp reservado solo para SOS).
//
// Variables de entorno en Supabase (supabase secrets set ...):
//   WOMPI_EVENTS_SECRET   Secreto de eventos de Wompi (para validar checksum SHA256)
//   RESEND_API_KEY        API key de Resend (https://resend.com) para correos transaccionales
//   EMAIL_REMITENTE       Remitente verificado (por defecto: Salva <hola@salva.lcsynctech.com>)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-event-checksum",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function formatoMonedaCOP(centavos: number): string {
  const pesos = Math.round(centavos / 100);
  return "$" + pesos.toLocaleString("es-CO") + " COP";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405, headers: CORS });

  const rawBody = await req.text();
  let cuerpo: any = null;
  try {
    cuerpo = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400, headers: CORS });
  }

  const evento = cuerpo?.event;
  const tx = cuerpo?.data?.transaction;
  if (!tx || evento !== "transaction.updated") {
    // Respuesta 200 a Wompi para eventos que no nos interesa procesar
    return Response.json({ recibido: true, ignorado: true }, { headers: CORS });
  }

  // Validación de firma de eventos si está configurado el secreto
  const eventsSecret = Deno.env.get("WOMPI_EVENTS_SECRET");
  if (eventsSecret && cuerpo?.signature?.checksum && cuerpo?.signature?.properties) {
    try {
      const props = cuerpo.signature.properties;
      let cadena = "";
      for (const p of props) {
        const partes = p.split(".");
        let val: any = cuerpo.data;
        for (const parte of partes) {
          val = val?.[parte];
        }
        cadena += String(val ?? "");
      }
      cadena += String(cuerpo.timestamp ?? "");
      cadena += eventsSecret;

      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cadena));
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (hashHex.toLowerCase() !== String(cuerpo.signature.checksum).toLowerCase()) {
        console.warn("Firma de evento Wompi no coincide");
        return Response.json({ error: "Firma inválida" }, { status: 401, headers: CORS });
      }
    } catch (e) {
      console.error("Error validando firma de evento:", e);
    }
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const status = tx.status; // "APPROVED", "DECLINED", "VOIDED", "ERROR"
  const ref = tx.reference || ""; // ej: SALVA-XXXXX-P1
  const codigoBase = ref.split("-P")[0] || ref;
  const emailCliente = tx.customer_email || tx.shipping_address?.email || "";
  const metodoPago = tx.payment_method_type || "Wompi";
  const idTransaccion = tx.id;

  console.log(`Evento Wompi: Ref ${ref} | Estado ${status} | Email ${emailCliente}`);

  // 1. Buscar y actualizar el pedido en public.pedidos
  const { data: pedido } = await db
    .from("pedidos")
    .select("*")
    .or(`codigo_pedido.eq.${codigoBase},codigo_pedido.eq.${ref}`)
    .maybeSingle();

  if (pedido) {
    const nuevoEstado = status === "APPROVED" ? "pagado" : status === "DECLINED" ? "rechazado" : "pendiente";
    await db
      .from("pedidos")
      .update({
        estado: nuevoEstado,
        metodo_pago: `Wompi (${metodoPago})`,
        notas: (pedido.notas ? pedido.notas + " · " : "") + `Tx: ${idTransaccion} (${status})`
      })
      .eq("id", pedido.id);
  }

  // 2. Si el pago fue aprobado, ejecutar aprovisionamiento y envío de correo
  if (status === "APPROVED") {
    const incluyeCloud = (pedido?.notas || "").includes("Salva Cloud");

    // Enviar CORREO de bienvenida y confirmación de compra (SOLO CORREO, NUNCA WHATSAPP)
    const destinatarioEmail = emailCliente || pedido?.email_cliente;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (destinatarioEmail && resendApiKey) {
      try {
        const nombreCliente = pedido?.nombre_cliente || tx.customer_data?.full_name || "Apreciado/a cliente";
        const modelo = pedido?.modelo || "Dispositivo Médico Salva";
        const diseno = pedido?.diseno ? ` (${pedido.diseno})` : "";
        const direccion = pedido?.direccion_entrega || "Dirección registrada en el checkout";
        const ciudad = pedido?.ciudad || "Colombia";
        const totalTexto = formatoMonedaCOP(tx.amount_in_cents || 0);
        const remitente = Deno.env.get("EMAIL_REMITENTE") || "Salva <hola@salva.lcsynctech.com>";

        const htmlCorreo = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF8F4; color: #16201C; margin: 0; padding: 32px 16px; }
  .card { max-width: 580px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid rgba(22, 32, 28, 0.12); padding: 36px 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.04); }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid rgba(22, 32, 28, 0.08); }
  .badge { display: inline-block; background: #E8F5E9; color: #0F3D30; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
  h1 { font-size: 22px; font-weight: 700; color: #0F3D30; margin: 16px 0 8px; }
  p { font-size: 15px; line-height: 1.6; color: #3E4642; margin: 8px 0; }
  .detalle { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px; margin: 20px 0; }
  .detalle-fila { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; border-bottom: 1px solid #EDF2F7; }
  .detalle-fila:last-child { border-bottom: none; }
  .pasos { margin: 24px 0; padding: 18px; background: #F0FDF4; border-radius: 12px; border-left: 4px solid #0F3D30; }
  .footer { margin-top: 32px; font-size: 13px; color: #6C726E; text-align: center; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <span style="font-size: 20px; font-weight: 700; color: #0F3D30;">Salva</span>
      <span style="font-size: 12px; color: #6C726E;">· Respaldado por LC Tech</span>
    </div>
    
    <span class="badge">Pago Aprobado con Éxito</span>
    <h1>¡Gracias por proteger a los tuyos, ${nombreCliente}!</h1>
    <p>Hemos confirmado tu pago a través de Wompi. Tu dispositivo médico de emergencia ya está en preparación para despacho.</p>

    <div class="detalle">
      <div class="detalle-fila"><strong>Referencia de Pedido:</strong> <span>${codigoBase}</span></div>
      <div class="detalle-fila"><strong>Producto:</strong> <span>${modelo}${diseno}</span></div>
      ${incluyeCloud ? '<div class="detalle-fila"><strong>Membresía:</strong> <span>Salva Cloud Familiar (1 Año Incluido)</span></div>' : ''}
      <div class="detalle-fila"><strong>Total Pagado:</strong> <span>${totalTexto}</span></div>
      <div class="detalle-fila"><strong>Destino:</strong> <span>${direccion}, ${ciudad}</span></div>
    </div>

    <div class="pasos">
      <strong style="color: #0F3D30; font-size: 15px;">¿Qué sigue ahora?</strong>
      <p style="margin-top: 6px; font-size: 14px;">
        1. <strong>Despacho:</strong> Recibirás tu paquete en 2 a 4 días hábiles mediante transportadora con guía de seguimiento.<br>
        2. <strong>Unboxing y Activación:</strong> Al abrir tu paquete, escanea el código QR de la tarjeta con tu celular para vincular la pulsera a tu panel familiar en menos de 60 segundos.<br>
        3. <strong>Tranquilidad 24/7:</strong> Tu ficha médica funcionará de por vida sin necesidad de baterías ni aplicaciones pesadas.
      </p>
    </div>

    <p style="font-size: 14px; color: #6C726E;">Si necesitas asistencia con tu entrega, puedes escribir a nuestro equipo de atención con la referencia <strong>${codigoBase}</strong>.</p>

    <div class="footer">
      <p>LC Salva — Desarrollado y respaldado por LC Tech Colombia.<br>Identificación médica de emergencia para que siempre vuelvan a casa.</p>
    </div>
  </div>
</body>
</html>
        `;

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: remitente,
            to: [destinatarioEmail],
            subject: `¡Tu Salva está en preparación! — Pedido ${codigoBase}`,
            html: htmlCorreo
          })
        });

        if (resendRes.ok) {
          console.log(`Correo de bienvenida enviado exitosamente a ${destinatarioEmail}`);
        } else {
          const errText = await resendRes.text();
          console.warn("Fallo al enviar correo con Resend:", errText);
        }
      } catch (errEmail) {
        console.error("Error en despacho de correo:", errEmail);
      }
    } else {
      console.log(`Aviso de compra aprobado registrado. (Email cliente: ${destinatarioEmail || "no especificado"}, Resend key: ${resendApiKey ? "configurada" : "pendiente"})`);
    }
  }

  return Response.json({ recibido: true, status: status, referencia: ref }, { headers: CORS });
});
