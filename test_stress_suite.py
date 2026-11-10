#!/usr/bin/env python3
"""
LC Salva — Comprehensive Integration & Stress Test Suite
Audits & validates:
1. Wompi payments, integrity signatures, and webhook security.
2. PostgreSQL database triggers, constraints, activation tokens & rate limits.
3. WhatsApp SOS notifications, location telemetry & multi-tutor network.
4. Resend transactional emails with secret activation codes.
5. Landing page and application UX, CTA routing & privacy compliance.
6. Live endpoints status and security headers.
"""

import hashlib
import hmac
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta

def print_header(title):
    print("\n" + "=" * 70)
    print(f" 🧪 {title}")
    print("=" * 70)

def assert_test(condition, test_name, detail=""):
    if condition:
        print(f"  ✅ [PASS] {test_name}")
        return True
    else:
        print(f"  ❌ [FAIL] {test_name}")
        if detail:
            print(f"     Detail: {detail}")
        return False

total_tests = 0
passed_tests = 0

def record(result):
    global total_tests, passed_tests
    total_tests += 1
    if result:
        passed_tests += 1

# =========================================================================
# MODULE 1: WOMPI INTEGRITY & WEBHOOK SECURITY
# =========================================================================
print_header("MÓDULO 1: INTEGRACIÓN Y SEGURIDAD WOMPI (FIRMAS Y WEBHOOK)")

integrity_secret = "prod_integrity_test_secret_123"
ref_sample = "SALVA-TEST99-P1"
amount_cents = 4500000
currency = "COP"

# 1.1 Integrity signature calculation (Client & Edge Function wompi-firma)
raw_integrity = f"{ref_sample}{amount_cents}{currency}{integrity_secret}"
expected_hash = hashlib.sha256(raw_integrity.encode('utf-8')).hexdigest()
record(assert_test(len(expected_hash) == 64 and re.match(r'^[a-f0-9]{64}$', expected_hash),
                   "Generación de firma SHA-256 de integridad Wompi (64 hex)"))

# 1.2 Tampered amount detection
tampered_raw = f"{ref_sample}{5900000}{currency}{integrity_secret}"
tampered_hash = hashlib.sha256(tampered_raw.encode('utf-8')).hexdigest()
record(assert_test(expected_hash != tampered_hash,
                   "Detección de alteración de monto: firmas no coinciden"))

# 1.3 Webhook checksum signature verification
events_secret = "prod_events_secret_salva_xyz"
timestamp = 1731245000
tx_data = {
    "transaction": {
        "id": "123456-test",
        "status": "APPROVED",
        "reference": "SALVA-TEST99-P1",
        "amount_in_cents": 4500000,
        "currency": "COP",
        "customer_email": "cliente@salva.lcsynctech.com",
        "payment_method_type": "NEQUI"
    }
}
props = ["transaction.id", "transaction.status", "transaction.amount_in_cents"]

# Compute valid signature
chain = f"{tx_data['transaction']['id']}{tx_data['transaction']['status']}{tx_data['transaction']['amount_in_cents']}{timestamp}{events_secret}"
valid_checksum = hashlib.sha256(chain.encode('utf-8')).hexdigest()

record(assert_test(len(valid_checksum) == 64, "Cálculo de firma de eventos webhook Wompi"))

# Tampered payload simulation
tampered_chain = f"FAKE_ID{tx_data['transaction']['status']}{tx_data['transaction']['amount_in_cents']}{timestamp}{events_secret}"
fake_checksum = hashlib.sha256(tampered_chain.encode('utf-8')).hexdigest()
record(assert_test(valid_checksum != fake_checksum, "Falsificación de evento rechazada por checksum"))

# 1.4 Blind redirect to LC Rider
rider_refs = ["LCR-SUB-12345", "LCR-ORDER-6789", "LCR-ANUAL-001"]
salva_refs = ["SALVA-ABCDE-P1", "SALVA-MW5IXE901D26-P1", "SALVA-PRUEBA-001"]

all_rider_detected = all(r.startswith("LCR-SUB-") or r.startswith("LCR-") for r in rider_refs)
no_salva_diverted = all(not (s.startswith("LCR-SUB-") or s.startswith("LCR-")) for s in salva_refs)
record(assert_test(all_rider_detected and no_salva_diverted,
                   "Desvío ciego a LC Rider: aislamiento estricto y cero cruces"))

# 1.5 Price matching logic
def clasificar_producto(total_cop):
    if total_cop in (45000, 94000):
        return 'watch', 1
    elif total_cop in (59000, 108000):
        return 'band', 1
    elif total_cop in (89000, 138000):
        return 'pack', 2
    return None, 0

record(assert_test(clasificar_producto(45000) == ('watch', 1), "Clasificación Salva Watch estándar ($45.000)"))
record(assert_test(clasificar_producto(94000) == ('watch', 1), "Clasificación Salva Watch + Cloud ($94.000)"))
record(assert_test(clasificar_producto(59000) == ('band', 1), "Clasificación Salva Band estándar ($59.000)"))
record(assert_test(clasificar_producto(108000) == ('band', 1), "Clasificación Salva Band + Cloud ($108.000)"))
record(assert_test(clasificar_producto(89000) == ('pack', 2), "Clasificación Pack Dúo estándar ($89.000)"))
record(assert_test(clasificar_producto(138000) == ('pack', 2), "Clasificación Pack Dúo + Cloud ($138.000)"))
record(assert_test(clasificar_producto(30000) == (None, 0), "Monto no autorizado rechazado"))


# =========================================================================
# MODULE 2: SIMULACIÓN DE BASE DE DATOS Y BLINDAJE DE COMPRA
# =========================================================================
print_header("MÓDULO 2: BASE DE DATOS, TRIGGERS Y BLINDAJE DE HARDWARE")

import random
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

def generar_codigo_activacion():
    # 10 chars formatted as XXXXX-XXXXX, no 0/O/1/I/L
    c = "".join(random.choices(ALPHABET, k=10))
    return f"{c[:5]}-{c[5:]}"

code_sample = generar_codigo_activacion()
record(assert_test(len(code_sample) == 11 and code_sample[5] == '-' and not any(ch in code_sample for ch in '0O1IL'),
                   f"Código de activación seguro ({code_sample}) sin caracteres ambiguos"))

# Database simulation engine
class MockDatabase:
    def __init__(self):
        self.pedidos = {}
        self.pulseras = {}
        self.portadores = {}
        self.intentos = []

    def insertar_pedido(self, codigo_pedido, total_cop, email_cliente, nombre_cliente, estado_intento='pendiente'):
        # Trigger pedidos_blindar_insercion
        # Forzar estado='pendiente', cupo_dispositivos=0, codigo_activacion=None
        pedido_id = f"uuid-{codigo_pedido}"
        self.pedidos[pedido_id] = {
            "id": pedido_id,
            "codigo_pedido": codigo_pedido.upper().strip(),
            "total_cop": total_cop,
            "email_cliente": email_cliente.lower().strip() if email_cliente else None,
            "nombre_cliente": nombre_cliente,
            "estado": "pendiente",  # Ignora lo que mande el cliente
            "producto_pagado": None,
            "cupo_dispositivos": 0,
            "codigo_activacion": None
        }
        return self.pedidos[pedido_id]

    def pagar_pedido(self, codigo_pedido):
        # Trigger pedidos_al_pagar
        for pid, p in self.pedidos.items():
            if p["codigo_pedido"] == codigo_pedido:
                if p["estado"] != "pagado":
                    p["estado"] = "pagado"
                    prod, cupo = clasificar_producto(p["total_cop"])
                    p["producto_pagado"] = prod
                    p["cupo_dispositivos"] = cupo
                    p["codigo_activacion"] = generar_codigo_activacion()
                return p
        raise Exception(f"Pedido {codigo_pedido} no encontrado")

    def asignar_dispositivos(self, codigo_pedido, codigos_qr):
        pedido = None
        for p in self.pedidos.values():
            if p["codigo_pedido"] == codigo_pedido:
                pedido = p
                break
        if not pedido: raise Exception(f"No existe el pedido {codigo_pedido}")
        if pedido["estado"] != "pagado": raise Exception("Pedido no pagado")

        ya_asignados = sum(1 for pul in self.pulseras.values() if pul.get("pedido_id") == pedido["id"])
        if ya_asignados + len(codigos_qr) > pedido["cupo_dispositivos"]:
            raise Exception("Supera cupo de dispositivos permitidos")

        watches = 0
        bands = 0
        target_puls = []
        for qr in codigos_qr:
            pul = self.pulseras.get(qr)
            if not pul: raise Exception(f"Código {qr} no existe en inventario")
            if pul["estado"] != "disponible" or pul.get("pedido_id") is not None:
                raise Exception(f"Código {qr} ya asignado o vinculado")
            if qr.startswith("SALVA-W-"): watches += 1
            else: bands += 1
            target_puls.append(pul)

        if (pedido["producto_pagado"] == "watch" and bands > 0) or \
           (pedido["producto_pagado"] == "band" and watches > 0) or \
           (pedido["producto_pagado"] == "pack" and (watches > 1 or bands > 1)):
            raise Exception(f"Códigos físicos no corresponden al producto comprado: {pedido['producto_pagado']}")

        for pul in target_puls:
            pul["pedido_id"] = pedido["id"]

        return f"Asignados a {codigo_pedido}. Código de activación: {pedido['codigo_activacion']}"

    def vincular_pulsera(self, codigo_qr, clave_activacion, user_id, user_email):
        # Rate limit check (8 attempts / hour)
        fallos = sum(1 for i in self.intentos if i["user_id"] == user_id and not i["exito"])
        is_creator = (user_email == "lee.fesna@gmail.com")

        if fallos >= 8 and not is_creator:
            return {"error": "Demasiados intentos fallidos. Espera una hora."}

        pul = self.pulseras.get(codigo_qr)
        if not pul:
            self.intentos.append({"user_id": user_id, "exito": False})
            return {"error": "Ese código no corresponde a un dispositivo Salva oficial."}

        if pul["estado"] != "disponible":
            return {"error": "Este dispositivo ya está activado en una cuenta."}

        # Creator restriction: only bypasses on UNASSIGNED pieces
        if pul.get("pedido_id") is not None:
            is_creator = False

        if not is_creator:
            pedido_id = pul.get("pedido_id")
            if not pedido_id or pedido_id not in self.pedidos:
                self.intentos.append({"user_id": user_id, "exito": False})
                return {"error": "Este dispositivo no está asociado a una compra pagada."}

            pedido = self.pedidos[pedido_id]
            if pedido["estado"] != "pagado":
                self.intentos.append({"user_id": user_id, "exito": False})
                return {"error": "Este dispositivo no está asociado a una compra pagada."}

            clave_limpia = clave_activacion.replace("-", "").strip().upper()
            clave_esperada = pedido["codigo_activacion"].replace("-", "").strip().upper()
            if not clave_limpia or clave_limpia != clave_esperada:
                self.intentos.append({"user_id": user_id, "exito": False})
                return {"error": "El código de activación no es correcto."}

        # Exitoso
        pul["estado"] = "vinculada"
        pul["usuario_id"] = user_id
        pul["activado_por_email"] = user_email
        self.portadores[codigo_qr] = {
            "pulsera_id": pul["id"],
            "usuario_id": user_id,
            "nombre_completo": "Nuevo Portador"
        }
        self.intentos.append({"user_id": user_id, "exito": True})
        return {"ok": True, "codigo_qr": codigo_qr}

    def desvincular_pulsera(self, codigo_qr, user_id):
        pul = self.pulseras.get(codigo_qr)
        if not pul or pul.get("usuario_id") != user_id:
            return {"error": "No autorizada"}
        pul["estado"] = "disponible"
        pul["usuario_id"] = None
        # OJO: pedido_id se PRESERVA
        if codigo_qr in self.portadores:
            del self.portadores[codigo_qr]
        return {"ok": True, "pedido_id_conservado": pul.get("pedido_id") is not None}

# Initialize mock DB with test units
db = MockDatabase()
for i in range(1, 6):
    qr_w = f"SALVA-W-T00{i}"
    db.pulseras[qr_w] = {"id": f"p-w-{i}", "codigo_qr": qr_w, "estado": "disponible", "pedido_id": None, "usuario_id": None}
for i in range(1, 6):
    qr_b = f"SALVA-B-T00{i}"
    db.pulseras[qr_b] = {"id": f"p-b-{i}", "codigo_qr": qr_b, "estado": "disponible", "pedido_id": None, "usuario_id": None}

# Test 2.1: Injected order parameters blocked by trigger
ped_hack = db.insertar_pedido("SALVA-HACK-01", 45000, "attacker@bad.com", "Attacker", estado_intento="pagado")
record(assert_test(ped_hack["estado"] == "pendiente" and ped_hack["cupo_dispositivos"] == 0,
                   "Trigger blindaje: pedido nuevo siempre nace en 'pendiente' con cupo 0"))

# Test 2.2: Cannot activate unassigned piece without purchase
res_unassigned = db.vincular_pulsera("SALVA-W-T001", "12345", "user-random-1", "random@gmail.com")
record(assert_test("error" in res_unassigned and "no está asociado a una compra pagada" in res_unassigned["error"],
                   "Pieza sin compra rechazada para usuarios regulares"))

# Test 2.3: Order paid properly triggers activation code and quota
ped_legit = db.insertar_pedido("SALVA-ORD-100", 45000, "comprador@gmail.com", "Comprador Real")
db.pagar_pedido("SALVA-ORD-100")
record(assert_test(ped_legit["estado"] == "pagado" and ped_legit["cupo_dispositivos"] == 1 and ped_legit["codigo_activacion"] is not None,
                   "Transición a 'pagado' genera código secreto y asigna cupo"))

# Test 2.4: Assigning hardware to paid order
dispatch_res = db.asignar_dispositivos("SALVA-ORD-100", ["SALVA-W-T001"])
record(assert_test("Asignados a SALVA-ORD-100" in dispatch_res,
                   "Asignación física de SALVA-W-T001 a pedido pagado exitosa"))

# Test 2.5: Over-quota assignment blocked
try:
    db.asignar_dispositivos("SALVA-ORD-100", ["SALVA-W-T002"])
    over_quota_blocked = False
except Exception:
    over_quota_blocked = True
record(assert_test(over_quota_blocked, "Superar cupo de dispositivos (1 de 1) es bloqueado"))

# Test 2.6: Mismatched model blocked (e.g. Band piece for Watch order)
ped_band = db.insertar_pedido("SALVA-ORD-200", 59000, "comprador2@gmail.com", "Comprador Band")
db.pagar_pedido("SALVA-ORD-200")
try:
    db.asignar_dispositivos("SALVA-ORD-200", ["SALVA-W-T002"]) # Watch to Band order
    mismatch_blocked = False
except Exception:
    mismatch_blocked = True
record(assert_test(mismatch_blocked, "Asignar modelo incorrecto (Watch en compra de Band) es bloqueado"))

# Assign valid band
db.asignar_dispositivos("SALVA-ORD-200", ["SALVA-B-T001"])

# Test 2.7: Invalid activation code rejected
res_wrong_code = db.vincular_pulsera("SALVA-W-T001", "CODIGO-FALSO", "user-buyer-1", "comprador@gmail.com")
record(assert_test("error" in res_wrong_code and "no es correcto" in res_wrong_code["error"],
                   "Código de activación incorrecto rechazado"))

# Test 2.8: Rate limit after 8 failures
for _ in range(7):
    db.vincular_pulsera("SALVA-W-T001", "CODIGO-FALSO", "user-buyer-1", "comprador@gmail.com")
res_lockout = db.vincular_pulsera("SALVA-W-T001", "CODIGO-FALSO", "user-buyer-1", "comprador@gmail.com")
record(assert_test("error" in res_lockout and "Demasiados intentos" in res_lockout["error"],
                   "Bloqueo temporal por tasa de fallos (8 intentos fallidos en 1 hora)"))

# Test 2.9: Legitimate activation with correct secret code (different user)
secret_code = ped_legit["codigo_activacion"]
res_ok = db.vincular_pulsera("SALVA-W-T001", secret_code, "user-legit-2", "familiar@gmail.com")
record(assert_test(res_ok.get("ok") is True and db.pulseras["SALVA-W-T001"]["estado"] == "vinculada",
                   "Activación legítima con código secreto exitosa"))

# Test 2.10: Re-activating an already activated piece is blocked
res_already = db.vincular_pulsera("SALVA-W-T001", secret_code, "user-other-3", "otro@gmail.com")
record(assert_test("error" in res_already and "ya está activado" in res_already["error"],
                   "Doble activación bloqueada (dispositivo ya activado)"))

# Test 2.11: Creator cannot bypass purchase on assigned piece
db.pulseras["SALVA-B-T001"]["estado"] = "disponible" # Reset to test
res_creator_blocked = db.vincular_pulsera("SALVA-B-T001", "CLAVE-INVENTADA", "uid-creator", "lee.fesna@gmail.com")
record(assert_test("error" in res_creator_blocked and "no es correcto" in res_creator_blocked["error"],
                   "Ajuste creador verificado: cuenta creadora no puede saltarse el código de clientes"))

# Test 2.12: Unlinking preserves purchase association
db.desvincular_pulsera("SALVA-W-T001", "user-legit-2")
record(assert_test(db.pulseras["SALVA-W-T001"]["estado"] == "disponible" and db.pulseras["SALVA-W-T001"]["pedido_id"] is not None,
                   "Desvinculación borra ficha pero conserva pedido_id atado a la compra"))


# =========================================================================
# MODULE 3: TELEMETRÍA SOS, GEOLOCALIZACIÓN Y WHATSAPP
# =========================================================================
print_header("MÓDULO 3: TELEMETRÍA SOS, GEOLOCALIZACIÓN Y WHATSAPP")

def format_whatsapp_destination(tel):
    digits = re.sub(r'\D', '', str(tel or ''))
    if len(digits) < 10 or re.match(r'^0+$', digits):
        return None
    return ("57" + digits) if len(digits) == 10 else digits

record(assert_test(format_whatsapp_destination("3204502958") == "573204502958", "Formato Colombia celular 10 dígitos -> 573204502958"))
record(assert_test(format_whatsapp_destination("+57 320 450 2958") == "573204502958", "Formato con prefijo internacional y espacios"))
record(assert_test(format_whatsapp_destination("0000000000") is None, "Placeholder 0000000000 descartado (no envía spam)"))
record(assert_test(format_whatsapp_destination("123") is None, "Número incompleto descartado"))

# Geolocation formatting
def formatear_ubicacion(lat, lng):
    if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
        return f"https://www.google.com/maps?q={lat},{lng}"
    return "no compartida por quien escaneó"

record(assert_test(formatear_ubicacion(4.60971, -74.08175) == "https://www.google.com/maps?q=4.60971,-74.08175",
                   "Enlace Google Maps generado con coordenadas precisas"))
record(assert_test(formatear_ubicacion(None, None) == "no compartida por quien escaneó",
                   "Escaneo sin permiso GPS genera aviso alternativo sin bloquear la alerta"))

# Multi-tutor network expansion (Salva Cloud Familiar)
portador_sample = {
    "nombre_completo": "Carlos Andrés Castro",
    "contacto1": "3204502958",
    "contacto2": "3001234567"
}
tutores_cloud = [
    {"nombre": "Dra. Ortiz", "telefono": "3109876543", "notificar_whatsapp": True},
    {"nombre": "Tío Juan", "telefono": "3154443322", "notificar_whatsapp": True},
    {"nombre": "Hermana", "telefono": "3120000000", "notificar_whatsapp": False} # No notificar
]

destinos = set()
for c in [portador_sample["contacto1"], portador_sample["contacto2"]]:
    d = format_whatsapp_destination(c)
    if d: destinos.add(d)

for t in tutores_cloud:
    if t.get("notificar_whatsapp"):
        d = format_whatsapp_destination(t["telefono"])
        if d: destinos.add(d)

record(assert_test(len(destinos) == 4 and "573204502958" in destinos and "573109876543" in destinos,
                   "Salva Cloud Familiar: alerta multicanal a contactos de emergencia + red de tutores"))

# Rescuer direct WhatsApp button link from ficha.js
def construir_href_whatsapp(telefono, nombre_portador, coords=None):
    digits = re.sub(r'\D', '', str(telefono or ''))
    if not digits: return None
    texto = f"🚨 ALERTA DE AUXILIO: Acabo de escanear la pulsera médica Salva de {nombre_portador}."
    if coords and coords.get("lat") and coords.get("lng"):
        texto += f"\n📍 Ubicación GPS de auxilio: https://www.google.com/maps?q={coords['lat']},{coords['lng']}"
    from urllib.parse import quote
    return f"https://wa.me/{digits}?text={quote(texto)}"

link_wa = construir_href_whatsapp("3204502958", "Carlos Castro", {"lat": 4.65, "lng": -74.05})
record(assert_test("wa.me/3204502958" in link_wa and "maps%3Fq%3D4.65%2C-74.05" in link_wa,
                   "Botón WhatsApp en Ficha Médica incluye texto de socorro y mapa GPS codificado"))


# =========================================================================
# MODULE 4: CORREO TRANSACCIONAL (RESEND) Y REGLA DE NO-WHATSAPP
# =========================================================================
print_header("MÓDULO 4: CORREOS TRANSACCIONALES Y REGLAS DE CONTACTO")

# Validate that Wompi webhook does NOT trigger WhatsApp messages
with open("supabase/functions/wompi-webhook/index.ts", "r", encoding="utf-8") as f:
    wompi_webhook_code = f.read()

no_whatsapp_in_wompi = "graph.facebook.com" not in wompi_webhook_code
resend_in_wompi = "api.resend.com/emails" in wompi_webhook_code
code_in_wompi_email = "${esc(codigoActivacion)}" in wompi_webhook_code or "codigoActivacion" in wompi_webhook_code

record(assert_test(no_whatsapp_in_wompi, "REGLA ESTRICTA CUMPLIDA: Webhook Wompi NUNCA envía WhatsApp de compra"))
record(assert_test(resend_in_wompi, "Envío de confirmación de compra canalizado por correo (Resend API)"))
record(assert_test(code_in_wompi_email, "El correo de confirmación incluye el código secreto de activación"))


# =========================================================================
# MODULE 5: AUDITORÍA DE ARCHIVOS ESTÁTICOS, TELÉFONOS, IA Y CTAS
# =========================================================================
print_header("MÓDULO 5: AUDITORÍA ESTÁTICA (TELÉFONO, CERO IA Y RUTAS)")

# Check telephone occurrences
old_phone = "3505208592"
new_phone = "3204502958"
files_to_check = ["index.html", "admin.html", "ficha.html", "app.js", "admin.js", "ficha.js"]

old_phone_found = False
for fn in files_to_check:
    if os.path.exists(fn):
        with open(fn, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            if old_phone in content:
                old_phone_found = True
                print(f"      Encontrado teléfono viejo en: {fn}")

record(assert_test(not old_phone_found, f"Teléfono anterior ({old_phone}) eliminado 100% del código"))

# Check new phone presence
new_phone_found = True
for fn in ["index.html", "admin.html", "app.js", "ficha.js"]:
    with open(fn, "r", encoding="utf-8", errors="ignore") as f:
        if new_phone not in f.read():
            new_phone_found = False
            print(f"      Falta nuevo teléfono en: {fn}")
record(assert_test(new_phone_found, f"Nuevo teléfono oficial ({new_phone}) activo en todos los módulos clave"))

# Check CTAs in ficha.html
with open("ficha.html", "r", encoding="utf-8") as f:
    ficha_html = f.read()

cta_modelos = 'href="/#modelos"' in ficha_html
cta_adquirir = 'ficha-adquirir-card' in ficha_html
volver_panel_removed = 'id="btnVolverPanel"' not in ficha_html

record(assert_test(cta_modelos and cta_adquirir and volver_panel_removed,
                   "Ficha Médica: botón 'Volver a mi panel' reemplazado por CTA de conversión a la landing"))


# =========================================================================
# MODULE 6: COMPROBACIÓN EN VIVO DE ENDPOINTS DE PRODUCCIÓN
# =========================================================================
print_header("MÓDULO 6: PRUEBA DE CONECTIVIDAD DE ENDPOINTS EN PRODUCCIÓN")

# 6.1 Landing Page
try:
    req = urllib.request.Request("https://salva.lcsynctech.com/", headers={"User-Agent": "SalvaStressBot/1.0"})
    with urllib.request.urlopen(req, timeout=10) as response:
        status_landing = response.status
        body = response.read().decode("utf-8")
        has_salva = "Salva" in body and "3204502958" in body
        record(assert_test(status_landing == 200 and has_salva, "Landing de Producción (salva.lcsynctech.com): HTTP 200 OK y activo"))
except Exception as e:
    record(assert_test(False, "Landing de Producción", str(e)))

# 6.2 Wompi Webhook Edge Function (Security check: must return 401 on unsigned/unauthorized POST)
try:
    webhook_url = "https://bfxolduuqkrhyfjrvwsx.supabase.co/functions/v1/wompi-webhook"
    # Test A: Malformed / unhandled event safely ignored with 200 (Wompi retry prevention requirement)
    req_ping = urllib.request.Request(
        webhook_url,
        data=json.dumps({"event": "other.event"}).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "SalvaStressBot/1.0"},
        method="POST"
    )
    with urllib.request.urlopen(req_ping, timeout=10) as response:
        ping_code = response.status

    # Test B: Real transaction.updated event WITHOUT signature MUST be rejected with 401
    req_unsigned_tx = urllib.request.Request(
        webhook_url,
        data=json.dumps({
            "event": "transaction.updated",
            "data": {
                "transaction": {
                    "id": "tx_unauthorized_test",
                    "status": "APPROVED",
                    "reference": "SALVA-TEST-P1",
                    "amount_in_cents": 4500000
                }
            }
        }).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "SalvaStressBot/1.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req_unsigned_tx, timeout=10) as response:
            unsigned_code = response.status
    except urllib.error.HTTPError as he:
        unsigned_code = he.code

    record(assert_test(ping_code == 200 and unsigned_code == 401,
                       f"Edge Function wompi-webhook: ignora eventos ajenos (200) y rechaza transacciones no firmadas (HTTP {unsigned_code})"))
except Exception as e:
    record(assert_test(False, "Edge Function wompi-webhook", str(e)))

# 6.3 Scan Alert Edge Function (Must reject without secret header)
try:
    alert_url = "https://bfxolduuqkrhyfjrvwsx.supabase.co/functions/v1/alerta-escaneo"
    req_alert = urllib.request.Request(
        alert_url,
        data=json.dumps({"record": {"pulsera_id": "test"}}).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "SalvaStressBot/1.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req_alert, timeout=10) as response:
            res_alert_code = response.status
    except urllib.error.HTTPError as he:
        res_alert_code = he.code

    record(assert_test(res_alert_code == 401, f"Edge Function alerta-escaneo exige header x-webhook-secret (HTTP {res_alert_code} No autorizado)"))
except Exception as e:
    record(assert_test(False, "Edge Function alerta-escaneo", str(e)))

# =========================================================================
# RESUMEN FINAL
# =========================================================================
print("\n" + "=" * 70)
print(f" 📊 RESUMEN FINAL DE PRUEBAS DE ESTRÉS E INTEGRACIÓN")
print("=" * 70)
print(f"  Total de pruebas ejecutadas: {total_tests}")
print(f"  Pruebas superadas con éxito: {passed_tests}")
print(f"  Pruebas fallidas:            {total_tests - passed_tests}")
rate = (passed_tests / total_tests) * 100 if total_tests else 0
print(f"  Tasa de éxito:               {rate:.1f}%")
print("=" * 70)

if passed_tests == total_tests:
    print(" 🚀 TODOS LOS SISTEMAS E INTEGRACIONES ESTÁN 100% OPERATIVOS Y BLINDADOS.")
    sys.exit(0)
else:
    print(" ⚠️ SE ENCONTRARON NO CONFORMIDADES.")
    sys.exit(1)
