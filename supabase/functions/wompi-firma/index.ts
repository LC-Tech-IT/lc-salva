// Salva — Desarrollado y respaldado por LC Tech
// Edge Function: firma de integridad para el Widget de Wompi.
// Wompi exige signature:integrity = SHA256(referencia + montoEnCentavos + moneda + secretoIntegridad).
// El secreto vive solo aquí, como variable de entorno:
//   supabase secrets set WOMPI_INTEGRITY_SECRET=test_integrity_xxxxxxxx
//   supabase functions deploy wompi-firma
// Luego pega la URL de la función en WOMPI.firmaIntegridadUrl (app.js).

// Salva Band, Salva Watch, Pack Dúo — solos o con el order bump de Salva Cloud Familiar 1 año (+$49.000)
const PRECIOS_BASE_COP = [59000, 45000, 89000];
const ORDER_BUMP_COP = 49000;
const PRECIOS_VALIDOS_CENTAVOS = PRECIOS_BASE_COP.flatMap((p) => [p * 100, (p + ORDER_BUMP_COP) * 100]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const secreto = Deno.env.get("WOMPI_INTEGRITY_SECRET");
  if (!secreto) return Response.json({ error: "Secreto no configurado" }, { status: 500, headers: CORS });

  const { reference, amountInCents, currency } = await req.json().catch(() => ({}));
  const referenciaValida = typeof reference === "string" && /^SALVA-[A-Z0-9-]{4,60}$/.test(reference);

  // Solo se firman los precios oficiales: evita que alguien firme montos manipulados
  if (!referenciaValida || currency !== "COP" || !PRECIOS_VALIDOS_CENTAVOS.includes(amountInCents)) {
    return Response.json({ error: "Solicitud inválida" }, { status: 400, headers: CORS });
  }

  const cadena = `${reference}${amountInCents}${currency}${secreto}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cadena));
  const integrity = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");

  return Response.json({ integrity }, { headers: CORS });
});
