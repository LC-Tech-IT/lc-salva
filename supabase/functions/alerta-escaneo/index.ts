// Salva — Desarrollado y respaldado por LC Tech
// Edge Function: aviso automático por WhatsApp cuando alguien escanea una pulsera.
// La dispara un Database Webhook (INSERT en public.escaneos_ubicacion), nunca el navegador.
//
// Variables de entorno (supabase secrets set ...):
//   WEBHOOK_SECRET        valor compartido con el header x-webhook-secret del webhook
//   WHATSAPP_TOKEN        token permanente de la WhatsApp Business Platform (Cloud API)
//   WHATSAPP_PHONE_ID     Phone Number ID del número emisor
//   WHATSAPP_TEMPLATE     nombre de la plantilla "utility" aprobada (por defecto alerta_escaneo_salva)
//   WHATSAPP_LANG         idioma de la plantilla (por defecto es)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
//
// Plantilla sugerida (categoría UTILITY), 3 variables:
//   🚨 Alerta Salva: la pulsera de {{1}} acaba de ser escaneada.
//   📍 Ubicación del rescate: {{2}}
//   🕒 Hora: {{3}}
//   Comunícate de inmediato con quien la escaneó o revisa tu panel Salva.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const EMAIL_CREADOR = "lee.fesna@gmail.com";

function telefonoWhatsapp(telefono: string | null): string | null {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (digitos.length < 10 || /^0+$/.test(digitos)) return null; // descarta el placeholder 0000000000
  return digitos.length === 10 ? "57" + digitos : digitos; // números locales colombianos
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("No autorizado", { status: 401 });
  }

  const cuerpo = await req.json().catch(() => null);
  const escaneo = cuerpo?.record;
  if (!escaneo?.pulsera_id) return Response.json({ enviados: 0, motivo: "sin registro" });

  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) return Response.json({ enviados: 0, motivo: "WhatsApp no configurado" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: portador } = await db
    .from("portadores")
    .select("nombre_completo, usuario_id, contacto_emergencia_1_telefono, contacto_emergencia_2_telefono")
    .eq("pulsera_id", escaneo.pulsera_id)
    .maybeSingle();
  if (!portador) return Response.json({ enviados: 0, motivo: "pulsera sin portador" });

  const destinos = new Set<string>();
  [portador.contacto_emergencia_1_telefono, portador.contacto_emergencia_2_telefono]
    .map(telefonoWhatsapp).forEach((t) => t && destinos.add(t));

  // Salva Cloud Familiar: la Red Multi-Tutor (hasta 5) también recibe la alerta
  const { data: usuario } = await db.auth.admin.getUserById(portador.usuario_id);
  const esCreador = usuario?.user?.email?.toLowerCase() === EMAIL_CREADOR && !!usuario?.user?.email_confirmed_at;
  const { data: membresia } = await db
    .from("membresias_cloud").select("activa, vence_en").eq("usuario_id", portador.usuario_id).maybeSingle();
  const tieneCloud = esCreador ||
    (!!membresia?.activa && (!membresia.vence_en || new Date(membresia.vence_en) > new Date()));
  if (tieneCloud) {
    const { data: tutores } = await db
      .from("red_tutores").select("telefono").eq("usuario_id", portador.usuario_id).eq("notificar_whatsapp", true);
    (tutores || []).map((t) => telefonoWhatsapp(t.telefono)).forEach((t) => t && destinos.add(t));
  }

  const ubicacion = typeof escaneo.latitud === "number" && typeof escaneo.longitud === "number"
    ? `https://www.google.com/maps?q=${escaneo.latitud},${escaneo.longitud}`
    : "no compartida por quien escaneó";
  const hora = new Date(escaneo.created_at || Date.now())
    .toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });

  let enviados = 0;
  const errores: string[] = [];
  for (const destino of destinos) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destino,
        type: "template",
        template: {
          name: Deno.env.get("WHATSAPP_TEMPLATE") || "alerta_escaneo_salva",
          language: { code: Deno.env.get("WHATSAPP_LANG") || "es" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: portador.nombre_completo || "tu familiar" },
              { type: "text", text: ubicacion },
              { type: "text", text: hora },
            ],
          }],
        },
      }),
    });
    if (res.ok) enviados++;
    else errores.push(`${destino.slice(-4)}: ${res.status}`);
  }

  return Response.json({ enviados, destinos: destinos.size, errores });
});
